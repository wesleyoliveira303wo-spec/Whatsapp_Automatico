import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Send, Upload, Users, History, Clock } from 'lucide-react';

import { useContacts } from '@/hooks/useContacts';
import { ClientApiError, type Contact, type ContactImportReport } from '@/lib/clientApi';
import { formatPhoneNumber, formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';

interface ContactsPanelProps {
  /**
   * Só administrator/owner veem o botão de importar E o botão de
   * opt-out/opt-in por linha — as duas ações exigem `contact:manage` na API
   * (mesmo nível de risco: afetam a base do tenant inteiro/o consentimento
   * de uma pessoa, não são atendimento do dia a dia). A barreira real é
   * sempre a API; isto é só cortesia de UX.
   */
  canManage: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  import: 'Planilha',
  manual: 'Manual',
};

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite importar contatos.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 413) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'A planilha é grande demais.';
    }
  }
  return 'Não foi possível concluir a importação. Tente novamente.';
}

/** Fase L, Bloco L2 — mesma tradução de erro, para as ações de opt-out/opt-in. */
function consentErrorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite alterar o consentimento deste contato.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 404) return 'Este contato não existe mais.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/** Resumo em uma frase do relatório de importação — para o toast de sucesso. */
function summarize(report: ContactImportReport): string {
  const parts: string[] = [];
  if (report.created > 0) parts.push(`${report.created} novo(s)`);
  if (report.enriched > 0) parts.push(`${report.enriched} com nome preenchido`);
  if (report.unchanged > 0) parts.push(`${report.unchanged} já cadastrado(s)`);
  if (report.invalid.length > 0) parts.push(`${report.invalid.length} linha(s) ignorada(s)`);
  return parts.length > 0 ? parts.join(' · ') : 'Nenhuma linha processada.';
}

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string;
}

/** Card de contagem do topo — `value` já formatado (o card não sabe de números). */
function StatCard({ icon: Icon, label, value }: StatCardProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-muted-foreground">{label}</p>
        <p className="text-[18px] font-semibold leading-tight text-foreground">{value}</p>
      </div>
    </div>
  );
}

/**
 * Painel de Contatos (Fase L, Blocos L1/L1b/L2; retrofit visual 2026-08-16
 * a partir de um mockup do fundador) — lista a base de contatos do tenant
 * (`WhatsAppContact`, tenant-wide), com contagens no topo, importação de
 * planilha e controle de consentimento (opt-out/opt-in).
 *
 * DELIBERADAMENTE FORA nesta rodada, e visível como "em breve" na coluna da
 * direita: o painel de Disparos/Campanhas. Ele pressupõe um motor de envio
 * com ritmo controlado e disjuntor de segurança que ainda não existe (ver
 * `FASE_L_MOTOR_DE_LEADS.md` §9.3) — mostrar números de campanha aqui hoje
 * seria inventar dado. A seleção em lote (checkboxes) já funciona e alimenta
 * o contador do botão, para que o dia em que o motor existir seja só ligar a
 * ação.
 *
 * Igualmente fora: o botão "Filtros" do mockup. Um filtro correto precisa
 * ser server-side (a lista é paginada por cursor — filtrar só o que já
 * está na tela mentiria sobre o resultado), e isso é mudança de backend, não
 * de layout. Preferi não entregar um botão que não faz nada.
 */
export default function ContactsPanel({ canManage }: ContactsPanelProps): JSX.Element {
  const {
    contacts,
    stats,
    loading,
    errorMessage,
    hasMore,
    loadingMore,
    loadMore,
    search,
    setSearch,
    refresh,
    importCsv,
    optOut,
    optIn,
  } = useContacts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  // Fase L, Bloco L2 — id do contato com uma ação de opt-out/opt-in EM VOO,
  // para desabilitar só o botão daquela linha (não a lista inteira).
  const [togglingContactId, setTogglingContactId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allVisibleSelected = useMemo(
    () => contacts.length > 0 && contacts.every((contact) => selectedIds.has(contact.id)),
    [contacts, selectedIds],
  );

  function toggleOne(contactId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function toggleAllVisible(): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        contacts.forEach((contact) => next.delete(contact.id));
      } else {
        contacts.forEach((contact) => next.add(contact.id));
      }
      return next;
    });
  }

  async function handleToggleConsent(contact: Contact): Promise<void> {
    setTogglingContactId(contact.id);
    try {
      if (contact.optOutAt) {
        await optIn(contact.id);
        toast({
          variant: 'success',
          title: 'Consentimento revertido',
          description: 'Este contato voltou a poder receber campanhas.',
        });
      } else {
        await optOut(contact.id);
        toast({
          variant: 'success',
          title: 'Opt-out registrado',
          description: 'Este contato não entrará mais em nenhuma campanha.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível concluir',
        description: consentErrorMessageFor(error),
      });
    } finally {
      setTogglingContactId(null);
    }
  }

  /**
   * `FileReader`, não `File.prototype.text()` — deliberado: é o método de
   * leitura de arquivo com o suporte mais amplo (inclusive navegadores mais
   * antigos), e é o único dos dois que o ambiente de teste (jsdom) implementa
   * de fato.
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
      reader.readAsText(file);
    });
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Sempre limpar o input, mesmo em erro — senão selecionar o MESMO
    // arquivo duas vezes seguidas não dispara `onChange` de novo.
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const csvText = await readFileAsText(file);
      const report = await importCsv(csvText);
      toast({
        variant: 'success',
        title: 'Importação concluída',
        description: summarize(report),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível importar',
        description: errorMessageFor(error),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total de contatos"
            value={stats ? String(stats.total) : '—'}
          />
          <StatCard
            icon={MessageSquare}
            label="Com conversa"
            value={stats ? String(stats.withConversation) : '—'}
          />
          <StatCard
            icon={Clock}
            label="Sem conversa"
            value={stats ? String(stats.withoutConversation) : '—'}
          />
          <StatCard icon={History} label="Última atualização" value="Agora" />
        </div>

        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="h-[34px] min-w-[220px] flex-1 rounded-[9px] border-border bg-panel text-[13px]"
          />
          {canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleFileSelected(event)}
              />
              <Button
                type="button"
                variant="outline"
                size="cta"
                className="shrink-0"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {importing ? 'Importando…' : 'Importar planilha'}
              </Button>
              <Button
                type="button"
                size="cta"
                className="shrink-0"
                disabled
                title="Campanhas ainda não estão disponíveis — em desenvolvimento."
              >
                <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Novo disparo
                {selectedIds.size > 0 && ` (${selectedIds.size})`}
              </Button>
            </>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : errorMessage ? (
          <ErrorState description={errorMessage} onRetry={refresh} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
            description={
              search
                ? 'Tente buscar por outro nome ou telefone.'
                : canManage
                  ? 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp, ou importe uma planilha.'
                  : 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp.'
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                aria-label="Selecionar todos os contatos desta página"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">Contato</span>
              <span className="hidden w-[110px] shrink-0 sm:block">Fonte</span>
              <span className="hidden w-[150px] shrink-0 md:block">Último contato</span>
              <span className="w-[150px] shrink-0 text-right">Ações</span>
            </div>

            {contacts.map((contact, index) => (
              <div
                key={contact.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  index < contacts.length - 1 && 'border-b border-border/70',
                )}
                data-testid={`contact-row-${contact.id}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${contact.name ?? formatPhoneNumber(contact.phoneE164)}`}
                  checked={selectedIds.has(contact.id)}
                  onChange={() => toggleOne(contact.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {contact.name ?? formatPhoneNumber(contact.phoneE164)}
                    </p>
                    {contact.optOutAt && (
                      <Badge variant="warning" className="shrink-0">
                        Opt-out
                      </Badge>
                    )}
                  </div>
                  {contact.name && (
                    <p className="truncate text-[12px] text-muted-foreground">
                      {formatPhoneNumber(contact.phoneE164)}
                    </p>
                  )}
                </div>

                <span className="hidden w-[110px] shrink-0 text-[12px] text-muted-foreground sm:block">
                  {SOURCE_LABELS[contact.source] ?? contact.source}
                </span>
                <span className="hidden w-[150px] shrink-0 text-[12px] text-muted-foreground md:block">
                  {formatDateTime(contact.lastActivityAt ?? contact.createdAt)}
                </span>

                <div className="flex w-[150px] shrink-0 items-center justify-end gap-1.5">
                  {contact.lastConversationId && contact.lastConversationSessionName && (
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/sessions/${encodeURIComponent(contact.lastConversationSessionName)}/conversations/${encodeURIComponent(contact.lastConversationId)}`}
                      >
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Abrir conversa
                      </Link>
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={togglingContactId === contact.id}
                      onClick={() => void handleToggleConsent(contact)}
                    >
                      {togglingContactId === contact.id
                        ? '…'
                        : contact.optOutAt
                          ? 'Reverter opt-out'
                          : 'Marcar opt-out'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !errorMessage && hasMore && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 xl:w-[340px]">
        <div className="rounded-lg border border-dashed border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Send className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">Disparos / Campanhas</p>
              <Badge variant="secondary" className="mt-0.5">
                Em breve
              </Badge>
            </div>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.55] text-muted-foreground">
            Enviar mensagens para vários contatos de uma vez ainda está em desenvolvimento. O envio
            precisa de ritmo controlado e parada automática de segurança — sem isso, o número do
            WhatsApp corre risco de bloqueio.
          </p>
          <p className="mt-2.5 text-[12.5px] leading-[1.55] text-muted-foreground">
            Enquanto isso, a base de contatos e o opt-out já estão prontos: quem pedir para sair não
            entrará em nenhuma campanha futura.
          </p>
        </div>
      </aside>
    </div>
  );
}
