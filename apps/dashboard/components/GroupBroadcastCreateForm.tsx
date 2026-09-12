import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Users, Search, Paperclip, X, FileText, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

import {
  ClientApiError,
  createGroupBroadcast,
  attachGroupBroadcastMedia,
  fetchWhatsAppGroups,
  type WhatsAppGroupSummary,
  type GroupBroadcastSummary,
  type GroupBroadcastMediaContentType,
} from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

interface GroupBroadcastCreateFormProps {
  sessionName: string;
  onCreated?: () => void;
  onClose?: () => void;
}

/** Teto do lado do CLIENTE — puramente UX (falha rápido); a API impõe o teto de verdade (413). Espelha `MAX_GROUP_MEDIA_BYTES.video` (o maior dos dois). */
const MAX_CLIENT_MEDIA_BYTES = 16 * 1024 * 1024;

/** Intervalos oferecidos na tela — o Domain aceita 1h a 24h; aqui só os saltos usuais. */
const RECURRENCE_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 24];

const MAX_GROUPS_PER_BROADCAST = 30;

/** Deriva a categoria do Domain a partir do `File.type` — mesmo padrão de `CampaignCreateForm.mediaContentTypeFor`, restrito a imagem/vídeo. */
function mediaContentTypeFor(file: File): GroupBroadcastMediaContentType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite criar disparos em grupos.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'whatsapp_not_connected')
      return 'Este WhatsApp não está conectado — conecte para ver os grupos.';
    if (code === 'groups_fetch_timeout')
      return 'O WhatsApp não respondeu à consulta de grupos a tempo. Tente de novo em instantes.';
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return 'Não foi possível criar o disparo. Tente novamente.';
}

function mediaErrorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'group_broadcast_media_too_large') return 'Arquivo grande demais para anexar.';
    if (code === 'group_broadcast_media_type_mismatch')
      return 'O arquivo não parece ser do tipo selecionado.';
  }
  return 'Não foi possível anexar o arquivo.';
}

/**
 * Formulário de criação de disparo em grupos (2026-09-11) — segunda função
 * de Campanhas: em vez de contatos individuais, publica em grupos de
 * WhatsApp dos quais o número desta sessão participa.
 *
 * O servidor confere cada grupo AO VIVO no momento da criação (nunca confia
 * no que esta tela sabe): um grupo pode ter deixado de existir, ou virado
 * "só administradores enviam" desde a última consulta — por isso a lista
 * carregada aqui pode divergir do resultado de `createGroupBroadcast` (que
 * mostra a tela seguinte, com o resultado REAL).
 *
 * **Este formulário só CRIA o disparo (sempre `draft`) e CALCULA quem
 * receberia — nunca envia mensagem nenhuma.** "Iniciar" pede confirmação
 * separada, na tela de lista/detalhe.
 */
export default function GroupBroadcastCreateForm({
  sessionName,
  onCreated,
  onClose,
}: GroupBroadcastCreateFormProps): JSX.Element {
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');

  const [groups, setGroups] = useState<WhatsAppGroupSummary[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, WhatsAppGroupSummary>>(new Map());

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Recorrencia (2026-09-11). Desligada por padrao: quem quer repetir, liga.
  const [recurring, setRecurring] = useState(false);
  const [intervalHours, setIntervalHours] = useState(2);
  const [stopMode, setStopMode] = useState<'runs' | 'date' | 'manual'>('runs');
  const [maxRuns, setMaxRuns] = useState(5);
  const [endsAt, setEndsAt] = useState('');
  const [windowEnabled, setWindowEnabled] = useState(true);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('20:00');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    broadcastId: string;
    summary: GroupBroadcastSummary;
  } | null>(null);

  function loadGroups(refresh = false): void {
    setLoadingGroups(true);
    setGroupsError(null);
    fetchWhatsAppGroups(sessionName, { refresh })
      .then((page) => setGroups(page.groups))
      .catch((error) => setGroupsError(errorMessageFor(error)))
      .finally(() => setLoadingGroups(false));
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; "Atualizar" é uma ação explícita.
  }, [sessionName]);

  function toggleGroup(group: WhatsAppGroupSummary): void {
    if (!group.canSend) return;
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(group.jid)) {
        next.delete(group.jid);
      } else if (next.size < MAX_GROUPS_PER_BROADCAST) {
        next.set(group.jid, group);
      } else {
        toast({
          variant: 'destructive',
          title: 'Limite de grupos atingido',
          description: `No máximo ${MAX_GROUPS_PER_BROADCAST} grupos por disparo.`,
        });
      }
      return next;
    });
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

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!groups) return [];
    if (!term) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(term));
  }, [groups, search]);

  const canSubmit =
    name.trim().length > 0 && messageTemplate.trim().length > 0 && selected.size > 0;

  const recurrenceIncomplete = recurring && stopMode === 'date' && endsAt.trim().length === 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting || recurrenceIncomplete) return;
    setSubmitting(true);
    setErrorMessage(null);
    setMediaError(null);
    try {
      const response = await createGroupBroadcast({
        sessionName,
        name: name.trim(),
        messageTemplate: messageTemplate.trim(),
        groupJids: Array.from(selected.keys()),
        ...(recurring
          ? {
              recurrenceIntervalHours: intervalHours,
              ...(stopMode === 'runs' ? { recurrenceMaxRuns: maxRuns } : {}),
              ...(stopMode === 'date' && endsAt
                ? { recurrenceEndsAt: new Date(endsAt).toISOString() }
                : {}),
              ...(windowEnabled
                ? { sendWindowStart: windowStart, sendWindowEnd: windowEnd }
                : {}),
            }
          : {}),
      });

      if (mediaFile) {
        try {
          await attachGroupBroadcastMedia(
            response.broadcast.id,
            mediaFile,
            mediaContentTypeFor(mediaFile),
          );
        } catch (mediaUploadError) {
          setMediaError(mediaErrorMessageFor(mediaUploadError));
        }
      }

      setResult({ broadcastId: response.broadcast.id, summary: response.summary });
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
        <h2 className="text-[16px] font-semibold text-foreground">Disparo criado</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          O disparo foi calculado — <strong>nenhuma mensagem foi enviada ainda</strong>. Para
          publicar de verdade, abra o disparo e use &quot;Iniciar envio&quot; (que pede confirmação
          separada).
        </p>

        {mediaError && (
          <p className="mt-2 text-[12.5px] text-destructive">
            O disparo foi criado, mas o anexo de mídia falhou: {mediaError} Você pode tentar de novo
            pela tela de detalhe.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[13px] text-foreground">
              <strong>{result.summary.pending}</strong> de <strong>{result.summary.total}</strong>{' '}
              grupo(s) {result.summary.pending === 1 ? 'está' : 'estão'} elegíve
              {result.summary.pending === 1 ? 'l' : 'is'} para receber esta mensagem.
            </p>
          </div>

          {result.summary.skipped > 0 && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
              <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-[13px] text-foreground">
                <strong>{result.summary.skipped}</strong> grupo(s) suprimido(s) — não existe(m) mais
                ou só administradores podem enviar lá.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button asChild>
            <Link
              href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/groups/${encodeURIComponent(result.broadcastId)}`}
            >
              Ver disparo
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
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">1. Informações</h2>
        <div className="mt-3 space-y-1.5">
          <label htmlFor="group-broadcast-name" className="text-sm font-medium text-foreground">
            Nome do disparo
          </label>
          <Input
            id="group-broadcast-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Aviso de promoção — grupos de clientes"
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">
            2. Grupos{' '}
            {selected.size > 0 && (
              <span className="font-normal text-muted-foreground">
                ({selected.size} selecionado{selected.size === 1 ? '' : 's'})
              </span>
            )}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingGroups}
            onClick={() => loadGroups(true)}
          >
            Atualizar lista
          </Button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          O servidor confere cada grupo de novo na hora de criar — um grupo que virou &quot;só
          administradores&quot; ou que você saiu entre agora e a criação será suprimido
          automaticamente.
        </p>

        {loadingGroups ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : groupsError ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-foreground">{groupsError}</p>
          </div>
        ) : (
          <>
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar grupo por nome…"
                aria-label="Buscar grupo por nome"
                className="h-[34px] pl-8 text-[13px]"
              />
            </div>

            <div className="mt-2 max-h-[280px] overflow-y-auto rounded-lg border border-border">
              {filteredGroups.length === 0 ? (
                <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                  {groups && groups.length === 0
                    ? 'Este WhatsApp não participa de nenhum grupo.'
                    : 'Nenhum grupo encontrado.'}
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <label
                    key={group.jid}
                    className={`flex items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 ${
                      group.canSend ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(group.jid)}
                      disabled={!group.canSend}
                      onChange={() => toggleGroup(group)}
                      aria-label={group.name}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {group.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {group.participantCount} participante{group.participantCount === 1 ? '' : 's'}
                    </span>
                    {group.announce && (
                      <Badge variant={group.canSend ? 'secondary' : 'warning'} className="shrink-0">
                        Só admins
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">3. Conteúdo do disparo</h2>
        <div className="mt-3 space-y-1.5">
          <label htmlFor="group-broadcast-message" className="text-sm font-medium text-foreground">
            Mensagem
          </label>
          <Textarea
            id="group-broadcast-message"
            value={messageTemplate}
            onChange={(event) => setMessageTemplate(event.target.value)}
            placeholder="Ex.: Olá, pessoal! Temos uma novidade para vocês."
            rows={4}
          />
        </div>

        <div className="mt-4">
          <p className="text-[13px] font-medium text-foreground">
            Anexo <span className="text-muted-foreground">(opcional — imagem ou vídeo)</span>
          </p>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
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

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">4. Repetição</h2>
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(event) => setRecurring(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
            aria-describedby="group-broadcast-recurrence-hint"
          />
          <span className="text-[13px]">
            <span className="font-medium text-foreground">Repetir automaticamente</span>
            <span id="group-broadcast-recurrence-hint" className="mt-0.5 block text-muted-foreground">
              Publica a mesma mensagem nos mesmos grupos de tempos em tempos. Publicar demais no
              mesmo grupo é o que mais gera denúncia — prefira o maior intervalo que servir.
            </span>
          </span>
        </label>

        {recurring && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div className="space-y-1.5">
              <label
                htmlFor="group-broadcast-interval-hours"
                className="text-sm font-medium text-foreground"
              >
                Repetir a cada
              </label>
              <select
                id="group-broadcast-interval-hours"
                value={intervalHours}
                onChange={(event) => setIntervalHours(Number(event.target.value))}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {RECURRENCE_HOUR_OPTIONS.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours === 1 ? '1 hora' : hours + ' horas'}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Até quando</legend>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="radio"
                  name="group-broadcast-stop-mode"
                  checked={stopMode === 'runs'}
                  onChange={() => setStopMode('runs')}
                  className="h-4 w-4"
                />
                Um número de repetições
              </label>
              {stopMode === 'runs' && (
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={maxRuns}
                  onChange={(event) => setMaxRuns(Number(event.target.value))}
                  aria-label="Quantas repetições"
                  className="ml-6 w-28"
                />
              )}

              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="radio"
                  name="group-broadcast-stop-mode"
                  checked={stopMode === 'date'}
                  onChange={() => setStopMode('date')}
                  className="h-4 w-4"
                />
                Uma data e hora de término
              </label>
              {stopMode === 'date' && (
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  aria-label="Data e hora de término"
                  className="ml-6 w-64 bg-card [color-scheme:light] dark:[color-scheme:dark]"
                />
              )}

              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="radio"
                  name="group-broadcast-stop-mode"
                  checked={stopMode === 'manual'}
                  onChange={() => setStopMode('manual')}
                  className="h-4 w-4"
                />
                Até eu cancelar
              </label>
              {stopMode === 'manual' && (
                <p className="ml-6 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Sem prazo para acabar: continua publicando até você pausar ou cancelar na tela do
                  disparo.
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={windowEnabled}
                  onChange={(event) => setWindowEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Só publicar dentro de um horário
              </label>
              {windowEnabled && (
                <div className="ml-6 flex items-center gap-2">
                  <Input
                    type="time"
                    value={windowStart}
                    onChange={(event) => setWindowStart(event.target.value)}
                    aria-label="Início do horário permitido"
                    className="w-28 bg-card [color-scheme:light] dark:[color-scheme:dark]"
                  />
                  <span className="text-[13px] text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={windowEnd}
                    onChange={(event) => setWindowEnd(event.target.value)}
                    aria-label="Fim do horário permitido"
                    className="w-28 bg-card [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              )}
              <p className="ml-6 text-[12px] text-muted-foreground">
                Uma repetição que cairia fora desse horário espera até a próxima janela — nunca é
                descartada.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">5. Revisão</h2>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="text-right font-medium text-foreground">{name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Grupos selecionados</dt>
            <dd className="text-right font-medium text-foreground">{selected.size}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Conteúdo</dt>
            <dd className="text-right text-foreground">
              {mediaFile ? `Texto + anexo (${mediaFile.name})` : 'Texto'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5 text-[12px] leading-[1.5] text-muted-foreground">
          Publicar em grupo é o padrão que o WhatsApp mais associa a spam — o ritmo entre grupos é
          espaçado (dezenas de segundos) e um disparo pausa sozinho ao primeiro sinal de falhas
          seguidas. Ao confirmar aqui, o disparo é só CRIADO (como rascunho, sem publicar nada); você
          ainda precisará abrir o disparo e confirmar &quot;Iniciar envio&quot; separadamente.
        </p>
        {errorMessage && <p className="mt-2 text-[12.5px] text-destructive">{errorMessage}</p>}
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
            {submitting ? 'Criando…' : 'Criar disparo (rascunho)'}
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
