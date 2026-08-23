import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Users,
  History,
  Clock,
  UserX,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  Download,
  ShieldOff,
  Zap,
  PieChart as PieChartIcon,
} from 'lucide-react';

import { useContacts } from '@/hooks/useContacts';
import {
  ClientApiError,
  type Contact,
  type ContactImportReport,
  type ContactStatusFilter,
} from '@/lib/clientApi';
import {
  formatPhoneNumber,
  formatPersonLabel,
  formatPersonLabelParts,
  formatDateTime,
} from '@/lib/formatters';
import DisplayNameParts from '@/components/DisplayNameParts';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';
import ContactFormDialog from '@/components/ContactFormDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface ContactsPanelProps {
  /**
   * Só administrator/owner veem os botões de adicionar/importar/editar/
   * excluir/consentimento — todos exigem `contact:manage` na API (mesmo
   * nível de risco: afetam a base do tenant inteiro/a identidade de uma
   * pessoa, não são atendimento do dia a dia). A barreira real é sempre a
   * API; isto é só cortesia de UX.
   */
  canManage: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  import: 'Planilha',
  manual: 'Manual',
};

/** Paleta puramente decorativa para diferenciar avatares — nunca carrega significado de estado (ver tokens semânticos em `Badge`). */
const AVATAR_PALETTE = [
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
];

/** `count/total` como inteiro percentual, 0 se `total` for 0 (nunca divide por zero). */
function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Padronização de exibição de contato (2026-08-20) — nome salvo sozinho
 * quando houver; senão telefone (obrigatório) + apelido do WhatsApp da
 * conversa mais recente, se a busca tiver resolvido um. Mesma regra usada em
 * Conversas/Pipeline (`formatContactDisplayName`), aqui sobre o telefone E.164
 * puro em vez de um `contactJid`. Versão em texto único — para aria-label e
 * diálogo, onde não há como estilizar o apelido separadamente.
 */
function labelFor(contact: Contact): string {
  return formatPersonLabel({
    phoneE164: contact.phoneE164,
    savedName: contact.name,
    nickname: contact.lastConversationContactName,
  });
}

/** Mesma regra de `labelFor`, em partes — para a linha visual da tabela (`DisplayNameParts`). */
function labelPartsFor(contact: Contact): ReturnType<typeof formatPersonLabelParts> {
  return formatPersonLabelParts({
    phoneE164: contact.phoneE164,
    savedName: contact.name,
    nickname: contact.lastConversationContactName,
  });
}

function initialsFor(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ContactAvatar({ contact }: { contact: Contact }): JSX.Element {
  // Iniciais a partir da fonte de nome (nunca do rótulo combinado "telefone ·
  // apelido" — dividir esse texto por espaço geraria iniciais sem sentido a
  // partir do "+55"/DDD). Mesma prioridade de `labelFor`: nome salvo > apelido
  // do WhatsApp > telefone.
  const initialsSource =
    contact.name ?? contact.lastConversationContactName ?? formatPhoneNumber(contact.phoneE164);
  const palette = AVATAR_PALETTE[hashString(contact.id) % AVATAR_PALETTE.length];
  return (
    <div
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
        palette,
      )}
      aria-hidden="true"
    >
      {initialsFor(initialsSource)}
    </div>
  );
}

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

/** Reorganização Contatos/Campanhas (2026-08-17) — mesma tradução de erro para excluir. */
function deleteErrorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite excluir contatos.';
    if (error.status === 404) return 'Este contato já não existe mais.';
  }
  return 'Não foi possível excluir. Tente novamente.';
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
  tone: 'primary' | 'success' | 'warning' | 'destructive';
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

/** Card de contagem do topo — `value` já formatado (o card não sabe de números). */
function StatCard({ icon: Icon, label, value, tone }: StatCardProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', TONE_CLASSES[tone])}
      >
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
 * Donut simples via `stroke-dasharray` — sem lib de gráfico. Só duas fatias
 * (com/sem conversa): juntas sempre somam `stats.total` exatamente (são
 * mutuamente exclusivas). Opt-out é um recorte ORTOGONAL (um contato opt-out
 * pode ter ou não conversa) — misturá-lo nas mesmas fatias contaria gente
 * duas vezes, por isso fica só como número à parte, nunca no anel.
 */
function InsightsDonut({
  withConversation,
  withoutConversation,
}: {
  withConversation: number;
  withoutConversation: number;
}): JSX.Element | null {
  const total = withConversation + withoutConversation;
  if (total === 0) return null;

  const circumference = 2 * Math.PI * 40;
  const segments = [
    { value: withConversation, className: 'stroke-success' },
    { value: withoutConversation, className: 'stroke-warning' },
  ];
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="14" className="stroke-muted" />
      {segments.map((segment, index) => {
        if (segment.value === 0) return null;
        const length = (segment.value / total) * circumference;
        const dashArray = `${length} ${circumference - length}`;
        const circle = (
          <circle
            key={index}
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="14"
            strokeDasharray={dashArray}
            strokeDashoffset={-offset}
            className={segment.className}
          />
        );
        offset += length;
        return circle;
      })}
    </svg>
  );
}

const FILTER_TABS: { key: ContactStatusFilter | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'with_conversation', label: 'Com conversa' },
  { key: 'without_conversation', label: 'Sem conversa' },
  { key: 'opted_out', label: 'Opt-outs' },
];

/**
 * Painel de Contatos — CRM puro (Fase L, Blocos L1/L1b/L2; retrofit visual
 * 2026-08-17, réplica de referência do fundador).
 *
 * **Reorganização Contatos/Campanhas (2026-08-17, 2ª rodada — pedido do
 * fundador):** Contatos e Campanhas são domínios visuais e funcionais
 * SEPARADOS. Esta tela não tem NENHUM elemento de disparo/campanha — nem
 * botão, nem card, nem CTA. "Importar contatos" aqui é SEMPRE para o CRM
 * (`POST /contacts/import`, o mesmo endpoint de sempre — nunca alimentou
 * campanha, só ganhou um rótulo mais claro). Campanhas vivem em
 * `/sessions/:s/campaigns` (rail próprio).
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
    status,
    setStatus,
    refresh,
    importCsv,
    optOut,
    optIn,
    create,
    update,
    remove,
  } = useContacts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [togglingContactId, setTogglingContactId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  // Seleção reseta ao trocar de aba/busca — evita "excluir" um contato que
  // nem está mais visível no filtro atual.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [status, search]);

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

  async function handleCreate(input: { name?: string; phone: string }): Promise<void> {
    const { wasCreated } = await create(input);
    toast({
      variant: 'success',
      title: wasCreated ? 'Contato adicionado' : 'Contato já existia',
      description: wasCreated
        ? 'O novo contato já aparece na lista.'
        : 'Já existia um contato com esse telefone — os dados atuais foram mantidos.',
    });
  }

  async function handleEditSubmit(input: { name?: string; phone: string }): Promise<void> {
    if (!editingContact) return;
    await update(editingContact.id, input);
    toast({ variant: 'success', title: 'Contato atualizado' });
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!deletingContact) return;
    setDeleting(true);
    try {
      await remove(deletingContact.id);
      toast({ variant: 'success', title: 'Contato removido' });
      setDeletingContact(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: deleteErrorMessageFor(error),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkOptOut(): Promise<void> {
    setBulkActionPending(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => optOut(id)));
      toast({
        variant: 'success',
        title: `${selectedIds.size} contato(s) marcado(s) como opt-out`,
      });
      setSelectedIds(new Set());
    } catch {
      toast({ variant: 'destructive', title: 'Alguns contatos não puderam ser atualizados' });
    } finally {
      setBulkActionPending(false);
    }
  }

  async function handleBulkDelete(): Promise<void> {
    setBulkActionPending(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => remove(id)));
      toast({ variant: 'success', title: `${selectedIds.size} contato(s) removido(s)` });
      setSelectedIds(new Set());
    } catch {
      toast({ variant: 'destructive', title: 'Alguns contatos não puderam ser removidos' });
    } finally {
      setBulkActionPending(false);
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

  const countFor = (key: ContactStatusFilter | 'all'): string => {
    if (!stats) return '';
    if (key === 'all') return String(stats.total);
    if (key === 'with_conversation') return String(stats.withConversation);
    if (key === 'without_conversation') return String(stats.withoutConversation);
    return String(stats.optedOut);
  };

  return (
    <div className="flex flex-col gap-5 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            icon={Users}
            label="Total de contatos"
            value={stats ? String(stats.total) : '—'}
            tone="primary"
          />
          <StatCard
            icon={MessageSquare}
            label="Com conversa"
            value={stats ? String(stats.withConversation) : '—'}
            tone="success"
          />
          <StatCard
            icon={Clock}
            label="Sem conversa"
            value={stats ? String(stats.withoutConversation) : '—'}
            tone="warning"
          />
          <StatCard
            icon={UserX}
            label="Opt-outs"
            value={stats ? String(stats.optedOut) : '—'}
            tone="destructive"
          />
          <StatCard icon={History} label="Última atualização" value="Agora" tone="primary" />
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
              {/* Input de arquivo sem UI própria aqui — o gatilho visível é
                  só "Importar contatos (CRM)" em Ações Rápidas (pedido do
                  fundador, 2026-08-18: um botão só, não duplicado). */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleFileSelected(event)}
              />
              <ContactFormDialog onSubmit={handleCreate} />
            </>
          )}
        </div>

        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => {
            const isActive = (status ?? 'all') === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(tab.key === 'all' ? undefined : tab.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px]',
                    isActive ? 'bg-primary/15' : 'bg-muted',
                  )}
                >
                  {countFor(tab.key)}
                </span>
              </button>
            );
          })}
        </div>

        {canManage && selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2">
            <span className="text-[12.5px] font-medium text-foreground">
              {selectedIds.size} selecionado(s)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkActionPending}
              onClick={() => void handleBulkOptOut()}
            >
              Marcar opt-out
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={bulkActionPending}
              onClick={() => void handleBulkDelete()}
            >
              Excluir
            </Button>
            <button
              type="button"
              className="ml-auto text-[12px] text-muted-foreground underline"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancelar seleção
            </button>
          </div>
        )}

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
                  ? 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp, ou adicione/importe manualmente.'
                  : 'Contatos aparecem aqui automaticamente quando alguém escreve no WhatsApp.'
            }
          />
        ) : (
          <div className="overflow-visible rounded-lg border border-border bg-card">
            {/*
              Onda 1 do redesign (2026-08-22) — tipografia do cabeçalho
              alinhada ao mesmo padrão agora usado por toda tabela do
              produto (11px/uppercase/semibold, Design System §6), SEM
              trocar a estrutura por `<table>`. Diferente de
              `CampaignsPanel`/`CampaignDetailPanel`, esta lista usa larguras
              FIXAS por "coluna" (`w-[165px]` etc., não `auto`/`fr`) — nunca
              teve o bug real de desalinhamento que motivou a migração das
              outras duas, e a colapsagem responsiva por breakpoint (telefone
              reaparece dentro da célula de nome em telas estreitas) é mais
              natural em flex do que em `<table>`. Reestruturar sem um
              defeito real a corrigir só arriscaria os testes existentes
              (865 linhas, padrão responsivo já validado) sem ganho.
            */}
            <div className="flex items-center gap-3 border-b border-border/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {canManage && (
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os contatos desta página"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                />
              )}
              <span className="min-w-0 flex-1">Contato</span>
              <span className="hidden w-[165px] shrink-0 sm:block">Telefone</span>
              <span className="hidden w-[145px] shrink-0 md:block">Última conversa</span>
              <span className="hidden w-[110px] shrink-0 lg:block">Status</span>
              <span className="w-[80px] shrink-0 text-right">Ações</span>
            </div>

            {contacts.map((contact, index) => (
              <div
                key={contact.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5',
                  index < contacts.length - 1 && 'border-b border-border/70',
                )}
                data-testid={`contact-row-${contact.id}`}
              >
                {canManage && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${labelFor(contact)}`}
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleOne(contact.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                )}

                <ContactAvatar contact={contact} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    <DisplayNameParts {...labelPartsFor(contact)} />
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground sm:hidden">
                    {formatPhoneNumber(contact.phoneE164)}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {SOURCE_LABELS[contact.source] ?? contact.source}
                  </p>
                </div>

                <span className="hidden w-[165px] shrink-0 truncate text-[12.5px] text-muted-foreground sm:block">
                  {formatPhoneNumber(contact.phoneE164)}
                </span>
                <span className="hidden w-[145px] shrink-0 truncate text-[12px] text-muted-foreground md:block">
                  {contact.lastActivityAt ? formatDateTime(contact.lastActivityAt) : '—'}
                </span>
                <span className="hidden w-[110px] shrink-0 lg:block">
                  {contact.optOutAt ? (
                    <Badge variant="warning">Opt-out</Badge>
                  ) : contact.lastConversationId ? (
                    <Badge variant="success">Com conversa</Badge>
                  ) : (
                    <Badge variant="secondary">Sem conversa</Badge>
                  )}
                </span>

                <div className="flex w-[80px] shrink-0 items-center justify-end gap-1">
                  {contact.lastConversationId && contact.lastConversationSessionName && (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <Link
                        href={`/sessions/${encodeURIComponent(contact.lastConversationSessionName)}/conversations/${encodeURIComponent(contact.lastConversationId)}`}
                        aria-label="Abrir conversa"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                  {canManage && (
                    <div className="relative" ref={openMenuId === contact.id ? menuRef : undefined}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Mais ações"
                        onClick={() =>
                          setOpenMenuId((current) => (current === contact.id ? null : contact.id))
                        }
                      >
                        <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      {openMenuId === contact.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                            onClick={() => {
                              setEditingContact(contact);
                              setOpenMenuId(null);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Editar
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                            disabled={togglingContactId === contact.id}
                            onClick={() => {
                              setOpenMenuId(null);
                              void handleToggleConsent(contact);
                            }}
                          >
                            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                            {contact.optOutAt ? 'Reverter opt-out' : 'Marcar opt-out'}
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setDeletingContact(contact);
                              setOpenMenuId(null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
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

        {/* Editar — controlado externamente (sem gatilho próprio), disparado pelo menu "⋮" da linha. */}
        <ContactFormDialog
          contact={editingContact ?? undefined}
          open={editingContact !== null}
          onOpenChange={(open) => {
            if (!open) setEditingContact(null);
          }}
          onSubmit={handleEditSubmit}
        />

        <Dialog
          open={deletingContact !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingContact(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir contato?</DialogTitle>
              <DialogDescription>
                {deletingContact &&
                  `"${labelFor(deletingContact)}" será removido definitivamente. O histórico de conversas não é apagado.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={deleting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <aside className="w-full shrink-0 space-y-4 xl:w-[300px]">
        {canManage && (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-foreground">Ações rápidas</p>
            </div>
            <div className="space-y-2">
              <ContactFormDialog onSubmit={handleCreate} triggerVariant="quick-action" />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-panel px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {importing ? 'Importando…' : 'Importar contatos (CRM)'}
              </button>
              <button
                type="button"
                disabled
                title="Exportação ainda não implementada."
                className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg border border-border bg-panel px-3 py-2 text-left text-[13px] text-muted-foreground opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exportar contatos
              </button>
              <button
                type="button"
                onClick={() => setStatus('opted_out')}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-panel px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
              >
                <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Gerenciar opt-outs
              </button>
            </div>
          </Card>
        )}

        {stats && stats.total > 0 && (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-foreground">Insights da base</p>
            </div>
            <div className="flex items-center gap-4">
              <InsightsDonut
                withConversation={stats.withConversation}
                withoutConversation={stats.withoutConversation}
              />
              <div className="flex-1 space-y-2 text-[12.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-success" />
                  <span className="text-foreground">Com conversa</span>
                  <span className="ml-auto text-muted-foreground">
                    {percentOf(stats.withConversation, stats.total)}% ({stats.withConversation})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-warning" />
                  <span className="text-foreground">Sem conversa</span>
                  <span className="ml-auto text-muted-foreground">
                    {percentOf(stats.withoutConversation, stats.total)}% (
                    {stats.withoutConversation})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-destructive" />
                  <span className="text-foreground">Opt-outs</span>
                  <span className="ml-auto text-muted-foreground">
                    {percentOf(stats.optedOut, stats.total)}% ({stats.optedOut})
                  </span>
                </div>
              </div>
            </div>

            <div className="my-3 border-t border-border/70" />

            <p className="mb-2 text-[12.5px] font-medium text-foreground">Principais fontes</p>
            <div className="space-y-1.5 text-[12.5px]">
              {(
                [
                  ['whatsapp', 'WhatsApp'],
                  ['import', 'Importação'],
                  ['manual', 'Manual'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5 text-muted-foreground">
                  <span>· {label}</span>
                  <span className="ml-auto text-foreground">
                    {percentOf(stats.bySource[key], stats.total)}% ({stats.bySource[key]})
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </aside>
    </div>
  );
}
