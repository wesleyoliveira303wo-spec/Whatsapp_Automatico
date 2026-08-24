import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, X, CheckCircle2, XCircle, Paperclip, FileText } from 'lucide-react';

import {
  ClientApiError,
  createCampaign,
  attachCampaignMedia,
  fetchContacts,
  parseRecipientsCsv,
  type Contact,
  type RawPhoneRecipient,
  type CampaignRecipientSummary,
  type CampaignSkipReason,
  type CampaignMediaContentType,
} from '@/lib/clientApi';
import { formatPersonLabelParts } from '@/lib/formatters';
import DisplayNameParts from '@/components/DisplayNameParts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

interface CampaignCreateFormProps {
  sessionName: string;
  /**
   * Reorganização Contatos/Campanhas (pivô 2026-08-17): formulário embutido
   * num `Dialog` disparado do painel lateral de Contatos (não mais uma
   * página própria). `onCreated` avisa o painel para recarregar a lista;
   * `onClose` fecha o modal (usado pelo botão "Fechar"/"Cancelar").
   */
  onCreated?: () => void;
  onClose?: () => void;
}

const SKIP_REASON_LABELS: Record<CampaignSkipReason, string> = {
  opt_out: 'Pediram para não receber mais campanhas',
  active_human_conversation: 'Já estão sendo atendidos por um humano',
  recently_contacted: 'Contatados por outra campanha há menos de 7 dias',
};

/** Teto do lado do CLIENTE — puramente UX (falha rápido); a API impõe o teto de verdade (`413`). Espelha `MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES`. */
const MAX_CLIENT_MEDIA_BYTES = 5 * 1024 * 1024;

/** Deriva a categoria do Domain a partir do `File.type` — mesmo padrão de `MessageComposer.mediaContentTypeFor`. */
function mediaContentTypeFor(file: File): CampaignMediaContentType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite criar campanhas.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 400) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'Dados inválidos.';
    }
  }
  return 'Não foi possível criar a campanha. Tente novamente.';
}

function mediaErrorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'campaign_media_too_large') return 'Arquivo grande demais para anexar.';
    if (code === 'campaign_media_type_mismatch')
      return 'O arquivo não parece ser do tipo selecionado.';
  }
  return 'Não foi possível anexar o arquivo.';
}

/** Mesma leitura de arquivo já usada em `ContactsPanel` (suporte mais amplo, único que o jsdom implementa de fato). */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsText(file);
  });
}

/**
 * "Colar números" — parse LOCAL, só para a prévia visual (contagem de
 * linhas não vazias). A normalização/validação de verdade acontece no
 * servidor, na hora de criar — números inválidos são descartados
 * silenciosamente lá (mesmo comportamento já documentado em
 * `CampaignService.createCampaign`).
 */
function splitManualLines(text: string): RawPhoneRecipient[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [phonePart, ...nameParts] = line.split(/[,;]/);
      const name = nameParts.join(',').trim();
      return { rawPhone: phonePart.trim(), name: name.length > 0 ? name : undefined };
    });
}

/**
 * Formulário de criação de campanha, em 4 seções — Reorganização Contatos/
 * Campanhas (2026-08-17). Embutido num `Dialog` largo, disparado do painel
 * "Disparos / Campanhas" dentro da tela de Contatos (pivô do fundador,
 * 2026-08-17: nunca virou página/aba própria — tudo fica dentro de
 * Contatos).
 *
 * **Este formulário só CRIA a campanha (sempre `DRAFT`) e CALCULA quem
 * receberia — nunca envia nenhuma mensagem.** O "Iniciar envio" de verdade
 * continua sendo uma ação separada, com sua própria confirmação, na página
 * de detalhe da campanha (Bloco L4, inalterado) — é ali que a mensagem
 * realmente sai. A "Seção 4 — Revisão" aqui mostra uma PRÉVIA (contagem
 * bruta, antes das regras de supressão); a contagem final REAL (depois de
 * descontar opt-out/conversa em atendimento/recontato recente) só existe
 * depois de confirmar, porque essas regras são calculadas no servidor no
 * momento da criação — o resultado aparece na tela seguinte, antes de
 * qualquer envio.
 */
export default function CampaignCreateForm({
  sessionName,
  onCreated,
  onClose,
}: CampaignCreateFormProps): JSX.Element {
  // Seção 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Seção 2 — Origem A: contatos salvos
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Map<string, Contact>>(new Map());

  // Seção 2 — Origem B: planilha
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRecipients, setCsvRecipients] = useState<RawPhoneRecipient[]>([]);
  const [csvInvalidCount, setCsvInvalidCount] = useState(0);
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [parsingCsv, setParsingCsv] = useState(false);

  // Seção 2 — Origem C: colar manualmente
  const [manualText, setManualText] = useState('');
  const manualRecipients = splitManualLines(manualText);

  // Seção 3 — conteúdo
  const [messageTemplate, setMessageTemplate] = useState('');
  // Fase L, Bloco L8 — mídia opcional anexada ao disparo. Upload real só
  // acontece DEPOIS da campanha existir (POST /:campaignId/media) — aqui só
  // guardamos a seleção local, mesmo racional de `csvFileName`/`csvRecipients`.
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Seção 4 — criação
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    campaignId: string;
    summary: CampaignRecipientSummary;
  } | null>(null);

  useEffect(() => {
    const query = contactSearch.trim();
    let cancelled = false;
    setSearchingContacts(true);
    const timer = setTimeout(() => {
      fetchContacts({ limit: 20, search: query || undefined })
        .then((page) => {
          if (!cancelled) setContactResults(page.contacts);
        })
        .catch(() => {
          if (!cancelled) setContactResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingContacts(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contactSearch]);

  function toggleContact(contact: Contact): void {
    setSelectedContacts((current) => {
      const next = new Map(current);
      if (next.has(contact.id)) next.delete(contact.id);
      else next.set(contact.id, contact);
      return next;
    });
  }

  async function handleCsvSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setParsingCsv(true);
    try {
      const csvText = await readFileAsText(file);
      const parsed = await parseRecipientsCsv(csvText);
      setCsvFileName(file.name);
      setCsvRecipients(parsed.recipients);
      setCsvInvalidCount(parsed.invalid.length);
      setCsvTotalRows(parsed.totalRows);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível ler a planilha',
        description: errorMessageFor(error),
      });
    } finally {
      setParsingCsv(false);
    }
  }

  function handleMediaSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_CLIENT_MEDIA_BYTES) {
      toast({
        variant: 'destructive',
        title: 'Arquivo grande demais',
        description: `O limite é de ${Math.round(MAX_CLIENT_MEDIA_BYTES / (1024 * 1024))}MB.`,
      });
      return;
    }
    setMediaError(null);
    setMediaFile(file);
  }

  function clearCsv(): void {
    setCsvFileName(null);
    setCsvRecipients([]);
    setCsvInvalidCount(0);
    setCsvTotalRows(0);
  }

  // Prévia bruta (antes de dedup/supressão no servidor) — só para orientar o operador.
  const rawTotal = selectedContacts.size + csvRecipients.length + manualRecipients.length;
  const canSubmit = name.trim().length > 0 && messageTemplate.trim().length > 0 && rawTotal > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setMediaError(null);
    try {
      const combinedPhoneRecipients: RawPhoneRecipient[] = [...csvRecipients, ...manualRecipients];
      const response = await createCampaign({
        sessionName,
        name: name.trim(),
        description: description.trim() || undefined,
        messageTemplate: messageTemplate.trim(),
        contactIds: Array.from(selectedContacts.keys()),
        phoneRecipients: combinedPhoneRecipients,
      });

      // A campanha já existe (sempre DRAFT) — anexar mídia é um SEGUNDO
      // request. Se falhar, a campanha continua criada normalmente (o
      // operador pode ver o erro e tentar de novo pela tela de detalhe) —
      // uma falha de anexo nunca deve parecer que a criação inteira falhou.
      if (mediaFile) {
        try {
          await attachCampaignMedia(
            response.campaign.id,
            mediaFile,
            mediaContentTypeFor(mediaFile),
          );
        } catch (mediaUploadError) {
          setMediaError(mediaErrorMessageFor(mediaUploadError));
        }
      }

      setResult({ campaignId: response.campaign.id, summary: response.summary });
      onCreated?.();
    } catch (error) {
      setErrorMessage(errorMessageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="p-6">
        <h2 className="text-[16px] font-semibold text-foreground">Campanha criada</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          A campanha foi calculada — <strong>nenhuma mensagem foi enviada ainda</strong>. Para
          disparar de verdade, abra a campanha e use &quot;Iniciar envio&quot; (que pede confirmação
          separada).
        </p>

        {mediaError && (
          <p className="mt-2 text-[12.5px] text-destructive">
            A campanha foi criada, mas o anexo de mídia falhou: {mediaError} Você pode tentar de
            novo pela tela de detalhe.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[13px] text-foreground">
              <strong>{result.summary.pending}</strong> de <strong>{result.summary.total}</strong>{' '}
              destinatário(s) {result.summary.pending === 1 ? 'está' : 'estão'} elegíve
              {result.summary.pending === 1 ? 'l' : 'is'} para receber esta campanha.
            </p>
          </div>

          {result.summary.skipped > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3">
              <div className="mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-[13px] font-medium text-foreground">
                  {result.summary.skipped} destinatário(s) suprimido(s)
                </p>
              </div>
              <ul className="space-y-1 pl-6 text-[12.5px] text-muted-foreground">
                {(Object.keys(result.summary.skipReasons) as CampaignSkipReason[]).map((reason) => (
                  <li key={reason} className="list-disc">
                    {SKIP_REASON_LABELS[reason]}:{' '}
                    <strong className="text-foreground">
                      {result.summary.skipReasons[reason]}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button asChild>
            <Link
              href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/${encodeURIComponent(result.campaignId)}`}
            >
              Ver campanha
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Seção 1 — Informações */}
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">1. Informações</h2>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="campaign-name" className="text-sm font-medium text-foreground">
              Nome da campanha
            </label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Promoção de agosto"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="campaign-description" className="text-sm font-medium text-foreground">
              Descrição <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Textarea
              id="campaign-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Só para você se orientar depois — não aparece para os destinatários."
              rows={2}
            />
          </div>
        </div>
      </Card>

      {/* Seção 2 — Destinatários */}
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">2. Destinatários</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Combine quantas origens quiser — duplicatas entre elas são resolvidas automaticamente.
        </p>

        <div className="mt-4 space-y-5">
          {/* Origem A: contatos salvos */}
          <div>
            <p className="text-[13px] font-medium text-foreground">
              Contatos salvos{' '}
              {selectedContacts.size > 0 && `(${selectedContacts.size} selecionado(s))`}
            </p>
            <Input
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone…"
              aria-label="Buscar contatos salvos por nome ou telefone"
              className="mt-1.5 h-[34px] text-[13px]"
            />
            <div className="mt-2 max-h-[220px] overflow-y-auto rounded-lg border border-border">
              {searchingContacts ? (
                <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">Buscando…</p>
              ) : contactResults.length === 0 ? (
                <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                  Nenhum contato encontrado.
                </p>
              ) : (
                contactResults.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={() => toggleContact(contact)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      <DisplayNameParts
                        {...formatPersonLabelParts({
                          phoneE164: contact.phoneE164,
                          savedName: contact.name,
                          nickname: contact.lastConversationContactName,
                        })}
                      />
                    </span>
                    {contact.optOutAt && (
                      <Badge variant="warning" className="shrink-0">
                        Opt-out
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Origem B: planilha */}
          <div>
            <p className="text-[13px] font-medium text-foreground">Planilha (.csv)</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Os números da planilha viram destinatários SÓ desta campanha — não criam contatos
              novos na base de Contatos.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void handleCsvSelected(event)}
            />
            {csvFileName ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">{csvFileName}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {csvTotalRows} linha(s) · {csvRecipients.length} válida(s)
                    {csvInvalidCount > 0 && ` · ${csvInvalidCount} ignorada(s)`}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearCsv}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={parsingCsv}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {parsingCsv ? 'Lendo…' : 'Selecionar planilha'}
              </Button>
            )}
          </div>

          {/* Origem C: colar manualmente */}
          <div>
            <p className="text-[13px] font-medium text-foreground">Colar números</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Um número por linha (opcionalmente com nome, separado por vírgula: &quot;11988887777,
              Maria&quot;).
            </p>
            <Textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder={'11988887777, Maria\n11977776666'}
              rows={4}
              className="mt-1.5 font-mono text-[12.5px]"
            />
            {manualRecipients.length > 0 && (
              <p className="mt-1 text-[12px] text-muted-foreground">
                {manualRecipients.length} número(s) digitado(s).
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Seção 3 — Conteúdo do disparo */}
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">3. Conteúdo do disparo</h2>

        <div className="mt-3 space-y-1.5">
          <label htmlFor="campaign-message" className="text-sm font-medium text-foreground">
            Mensagem
          </label>
          <Textarea
            id="campaign-message"
            value={messageTemplate}
            onChange={(event) => setMessageTemplate(event.target.value)}
            placeholder="Ex.: Olá! Temos uma novidade para você."
            rows={4}
          />
        </div>

        {/* Fase L, Bloco L8 — mídia opcional. A mensagem acima vira a LEGENDA
            quando há anexo (um envio só, nunca dois). */}
        <div className="mt-4">
          <p className="text-[13px] font-medium text-foreground">
            Anexo{' '}
            <span className="text-muted-foreground">(opcional — imagem, vídeo ou documento)</span>
          </p>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={handleMediaSelected}
          />
          {mediaFile ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {mediaFile.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {mediaContentTypeFor(mediaFile)} · {Math.round(mediaFile.size / 1024)}KB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMediaFile(null);
                  setMediaError(null);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => mediaInputRef.current?.click()}
            >
              <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Anexar arquivo
            </Button>
          )}
        </div>
      </Card>

      {/* Seção 4 — Revisão */}
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">4. Revisão</h2>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="text-right font-medium text-foreground">{name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Origem dos destinatários</dt>
            <dd className="text-right text-foreground">
              {selectedContacts.size} contato(s) salvo(s) + {csvRecipients.length} da planilha +{' '}
              {manualRecipients.length} digitado(s)
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Total bruto (antes de deduplicar)</dt>
            <dd className="text-right font-medium text-foreground">{rawTotal}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Conteúdo</dt>
            <dd className="text-right text-foreground">
              {mediaFile ? `Texto + anexo (${mediaFile.name})` : 'Texto'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5 text-[12px] leading-[1.5] text-muted-foreground">
          Este número é uma prévia. Ao confirmar, a campanha é criada (como rascunho, sem enviar
          nada) e o servidor calcula a contagem REAL — descontando quem pediu opt-out, quem já está
          em atendimento humano e quem foi contatado por outra campanha há menos de 7 dias. Você
          ainda precisará abrir a campanha e confirmar &quot;Iniciar envio&quot; separadamente para
          disparar de verdade.
        </p>
        {errorMessage && <p className="mt-2 text-[12.5px] text-destructive">{errorMessage}</p>}
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Criando…' : 'Criar campanha (rascunho)'}
          </Button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[12.5px] text-muted-foreground underline"
            >
              Cancelar
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
