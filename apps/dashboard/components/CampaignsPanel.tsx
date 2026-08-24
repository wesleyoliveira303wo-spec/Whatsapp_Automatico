import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer } from '@/lib/motion';
import AnimatedNumber from '@/components/ui/animated-number';
import {
  Megaphone,
  Send,
  MessageSquare,
  TrendingUp,
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Play,
  Pause,
  MoreVertical,
  XCircle,
  Trash2,
  RotateCcw,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  fetchCampaigns,
  fetchCampaign,
  fetchCampaignMetrics,
  fetchCampaignsOverview,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  reopenCampaign,
  deleteCampaign,
  ClientApiError,
  type Campaign,
  type CampaignStatus,
  type CampaignRecipientSummary,
  type CampaignMetrics,
  type CampaignSessionOverview,
} from '@/lib/clientApi';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import ErrorState from '@/components/states/ErrorState';
import CampaignCreateForm from '@/components/CampaignCreateForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface CampaignsPanelProps {
  sessionName: string;
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_BADGE_VARIANT: Record<
  CampaignStatus,
  'secondary' | 'success' | 'warning' | 'default' | 'destructive'
> = {
  draft: 'secondary',
  scheduled: 'secondary',
  running: 'success',
  paused: 'warning',
  completed: 'default',
  cancelled: 'destructive',
};

const STATUS_DOT_CLASS: Record<CampaignStatus, string> = {
  draft: 'bg-muted-foreground',
  scheduled: 'bg-muted-foreground',
  running: 'bg-primary',
  paused: 'bg-warning',
  completed: 'bg-success',
  cancelled: 'bg-destructive',
};

/** Texto do modal de confirmação compartilhado (start/cancel/delete/reopen) — um lookup em vez de ternários encadeados, mais fácil de ler/estender. */
const CONFIRM_ACTION_COPY: Record<
  'start' | 'cancel' | 'delete' | 'reopen',
  { title: string; description: string; confirmLabel: string; variant: 'default' | 'destructive' }
> = {
  start: {
    title: 'Confirmar disparo real',
    description:
      'Isto vai enviar mensagens de WhatsApp reais para os destinatários pendentes, com ritmo espaçado. Você poderá pausar a qualquer momento, mas mensagens já enviadas não podem ser desfeitas.',
    confirmLabel: 'Confirmar e enviar',
    variant: 'default',
  },
  cancel: {
    title: 'Cancelar esta campanha?',
    description:
      'Ação definitiva — uma campanha cancelada não pode ser retomada. Destinatários ainda pendentes não receberão mensagem nenhuma.',
    confirmLabel: 'Confirmar cancelamento',
    variant: 'destructive',
  },
  delete: {
    title: 'Excluir esta campanha?',
    description:
      'Ação definitiva e irreversível — a campanha e todos os seus destinatários serão apagados permanentemente. Mensagens já enviadas continuam entregues, mas o histórico desta campanha some.',
    confirmLabel: 'Excluir',
    variant: 'destructive',
  },
  // Retrofit 2026-08-18 — "reiniciar/refazer uma campanha".
  reopen: {
    title: 'Reabrir esta campanha?',
    description:
      'Isto vai tentar enviar de novo para quem falhou (ex.: uma instabilidade momentânea na conexão do WhatsApp) — mensagens reais. Quem foi suprimido por opt-out, conversa já com um atendente, ou contato recente por outra campanha nunca é reenviado.',
    confirmLabel: 'Confirmar e reenviar',
    variant: 'default',
  },
};

const FILTER_OPTIONS: { key: CampaignStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos os status' },
  { key: 'running', label: 'Em andamento' },
  { key: 'paused', label: 'Pausadas' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'draft', label: 'Rascunhos' },
];

type SortOption = 'recent' | 'oldest' | 'name';

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'recent', label: 'Mais recentes' },
  { key: 'oldest', label: 'Mais antigas' },
  { key: 'name', label: 'Nome (A-Z)' },
];

const PAGE_SIZE = 6;

/**
 * Teto de páginas de carregamento (auditoria 2026-08-22, P1.1). Antes desta
 * rodada `load()` buscava só a PRIMEIRA página (`fetchCampaigns({limit:50})`)
 * e tratava como se fosse tudo — o card do topo ("Total de campanhas") vem
 * de `GET /campaigns/overview`, agregado no servidor sobre TODAS as
 * campanhas da sessão, então uma sessão com mais de 50 campanhas mostrava um
 * total no card que a tabela (e a busca/filtro/paginação client-side sobre
 * ela) nunca conseguia alcançar — sem nenhum aviso. Mesmo remédio já usado
 * em `usePipelineConversations` (`MAX_PIPELINE_PAGES`): acumula por cursor
 * até esgotar ou bater o teto, e avisa (`truncated`) em vez de mentir por
 * omissão. 10 páginas × 50 = 500 campanhas, folga generosa sobre o volume
 * real (criar campanha é ação deliberada de administrador, não algo que
 * acumula como mensagem).
 */
const MAX_CAMPAIGNS_PAGES = 10;

interface CampaignRow {
  campaign: Campaign;
  summary?: CampaignRecipientSummary;
  metrics?: CampaignMetrics;
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar campanhas.';
    if (error.status === 503) return 'O motor de envio não está configurado neste ambiente.';
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/** `+N%`/`-N%` colorido (verde para alta, vermelho para queda) — `undefined` = sem base de comparação, não mostra nada (nunca inventa "0%"). */
function TrendBadge({ deltaPct }: { deltaPct?: number }): JSX.Element | null {
  if (deltaPct === undefined) return null;
  const positive = deltaPct >= 0;
  return (
    <span
      className={cn('text-[11.5px] font-medium', positive ? 'text-success' : 'text-destructive')}
    >
      {positive ? '+' : ''}
      {deltaPct}% vs. mês anterior
    </span>
  );
}

interface StatCardProps {
  icon: typeof Megaphone;
  label: string;
  value: string;
  deltaPct?: number;
  /** Onda 2 do redesign (2026-08-23) — quando presente, o card CONTA até o número (ver `MetricCard`, mesmo padrão). */
  numericValue?: number;
  /** Formata cada quadro da contagem; precisa devolver exatamente `value` no valor final. */
  formatValue?: (current: number) => string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  deltaPct,
  numericValue,
  formatValue,
}: StatCardProps): JSX.Element {
  return (
    <motion.div variants={fadeInUp} className="rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-[12.5px] text-muted-foreground">{label}</p>
      </div>
      <p className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">
        {numericValue !== undefined ? (
          <AnimatedNumber value={numericValue} format={formatValue} />
        ) : (
          value
        )}
      </p>
      <TrendBadge deltaPct={deltaPct} />
    </motion.div>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Donut "Progresso da campanha" (retrofit visual, réplica de imagem
 * 2026-08-18, 2ª rodada) — resposta vs. sem resposta, sobre o TOTAL
 * ENVIADO (`overview.totalSent`), com a taxa de resposta agregada no
 * centro. Mesmo dado de `overview.responseRate`, só desenhado.
 */
function ResponseProgressDonut({
  totalSent,
  totalReplied,
}: {
  totalSent: number;
  totalReplied: number;
}): JSX.Element | null {
  if (totalSent === 0) return null;
  const circumference = 2 * Math.PI * 40;
  const repliedLength = (totalReplied / totalSent) * circumference;
  const responseRatePct = Math.round((totalReplied / totalSent) * 100);
  return (
    <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0 -rotate-90">
      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="14" className="stroke-primary/20" />
      {totalReplied > 0 && (
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          strokeWidth="14"
          strokeDasharray={`${repliedLength} ${circumference - repliedLength}`}
          className="stroke-success"
        />
      )}
      <text
        x="50"
        y="46"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground text-[22px] font-semibold"
        style={{ transformOrigin: '50px 50px' }}
      >
        {responseRatePct}%
      </text>
      <text
        x="50"
        y="62"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-muted-foreground text-[9px]"
        style={{ transformOrigin: '50px 50px' }}
      >
        taxa de resposta
      </text>
    </svg>
  );
}

/**
 * Lista de campanhas de uma sessão — retrofit visual 2026-08-18, 2ª rodada
 * (réplica exata de imagem do fundador). Fase L, Blocos L3/L4/L7.
 *
 * Cards do topo, o donut "Progresso da campanha" e a lista "Status das
 * campanhas" vêm de `GET /campaigns/overview` (agregado no servidor, sobre
 * TODAS as campanhas da sessão — não só a página carregada/filtrada). A
 * tabela acumula `fetchCampaigns` por cursor até esgotar ou bater
 * `MAX_CAMPAIGNS_PAGES` (auditoria 2026-08-22, P1.1 — ver docstring da
 * constante) + `fetchCampaign`/`fetchCampaignMetrics` por campanha em
 * paralelo — mesmo padrão N+1 já aceito no restante do projeto para telas
 * de lista pequenas. Busca/filtro/ordenação/paginação (6 por página) são só
 * sobre esse conjunto já carregado — client-side, honesto porque a sessão
 * inteira (ou o recorte declarado via `truncated`) já está em memória, não
 * é uma lista paginada no servidor sendo cortada silenciosamente.
 */
export default function CampaignsPanel({ sessionName }: CampaignsPanelProps): JSX.Element {
  const [overview, setOverview] = useState<CampaignSessionOverview | null>(null);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'start' | 'cancel' | 'delete' | 'reopen';
    campaign: Campaign;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    async function loadAllCampaigns(): Promise<{
      campaigns: Campaign[];
      truncated: boolean;
    }> {
      const all: Campaign[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        // eslint-disable-next-line no-await-in-loop -- paginação sequencial deliberada, mesmo padrão de usePipelineConversations.
        const page = await fetchCampaigns({ sessionName, cursor, limit: 50 });
        all.push(...page.campaigns);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < MAX_CAMPAIGNS_PAGES);
      return { campaigns: all, truncated: cursor !== undefined };
    }

    Promise.all([fetchCampaignsOverview(sessionName), loadAllCampaigns()])
      .then(async ([overviewResult, page]) => {
        setOverview(overviewResult.overview);
        setTruncated(page.truncated);
        const withDetails = await Promise.all(
          page.campaigns.map(async (campaign) => {
            try {
              const [detail, metricsResult] = await Promise.all([
                fetchCampaign(campaign.id),
                fetchCampaignMetrics(campaign.id),
              ]);
              return {
                campaign: detail.campaign,
                summary: detail.summary,
                metrics: metricsResult.metrics,
              };
            } catch {
              return { campaign };
            }
          }),
        );
        withDetails.sort(
          (a, b) =>
            new Date(b.campaign.createdAt).getTime() - new Date(a.campaign.createdAt).getTime(),
        );
        setRows(withDetails);
      })
      .catch(() => setErrorMessage('Não foi possível carregar as campanhas.'))
      .finally(() => setLoading(false));
  }, [sessionName]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortMenuOpen]);

  // Muda o filtro/busca/ordenação: a página 1 sempre volta a ser a certa (senão a
  // paginação poderia apontar para uma página que não existe mais no resultado novo).
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortOption]);

  useEffect(() => {
    if (!rowMenuId) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(event.target as Node)) {
        setRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [rowMenuId]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter(({ campaign }) => {
      if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
      if (term && !campaign.name.toLowerCase().includes(term)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortOption === 'recent') {
      sorted.sort(
        (a, b) =>
          new Date(b.campaign.createdAt).getTime() - new Date(a.campaign.createdAt).getTime(),
      );
    } else if (sortOption === 'oldest') {
      sorted.sort(
        (a, b) =>
          new Date(a.campaign.createdAt).getTime() - new Date(b.campaign.createdAt).getTime(),
      );
    } else {
      sorted.sort((a, b) => a.campaign.name.localeCompare(b.campaign.name, 'pt-BR'));
    }
    return sorted;
  }, [rows, search, statusFilter, sortOption]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRows, page],
  );

  async function runAction(
    campaign: Campaign,
    action: () => Promise<{ campaign: Campaign }>,
    successMessage: string,
  ): Promise<void> {
    setActionPendingId(campaign.id);
    try {
      await action();
      toast({ variant: 'success', title: successMessage });
      load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível concluir',
        description: errorMessageFor(error),
      });
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleConfirmedAction(): Promise<void> {
    if (!confirmAction) return;
    const { type, campaign } = confirmAction;
    setConfirmAction(null);
    if (type === 'start') {
      await runAction(
        campaign,
        () => startCampaign(campaign.id),
        campaign.status === 'paused' ? 'Campanha retomada' : 'Campanha iniciada',
      );
    } else if (type === 'cancel') {
      await runAction(campaign, () => cancelCampaign(campaign.id), 'Campanha cancelada');
    } else if (type === 'reopen') {
      await runAction(campaign, () => reopenCampaign(campaign.id), 'Campanha reaberta');
    } else {
      setDeleting(true);
      try {
        await deleteCampaign(campaign.id);
        toast({ variant: 'success', title: 'Campanha excluída' });
        load();
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível excluir',
          description: errorMessageFor(error),
        });
      } finally {
        setDeleting(false);
      }
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Campanhas</h1>
          <p className="text-[13px] text-muted-foreground">
            Envie mensagens para seus contatos e acompanhe os resultados em tempo real.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="min-w-0 flex-1">
          {/* Onda 2 do redesign (2026-08-23) — faixa de indicadores em cascata, cada número contando até o valor. */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
            data-testid="campaigns-stat-cards"
          >
            <StatCard
              icon={Megaphone}
              label="Total de campanhas"
              value={overview ? String(overview.totalCampaigns) : '—'}
              numericValue={overview?.totalCampaigns}
              deltaPct={overview?.trends.campaignsDeltaPct}
            />
            <StatCard
              icon={Send}
              label="Mensagens enviadas"
              value={overview ? overview.totalSent.toLocaleString('pt-BR') : '—'}
              numericValue={overview?.totalSent}
              formatValue={(current) => Math.round(current).toLocaleString('pt-BR')}
              deltaPct={overview?.trends.messagesSentDeltaPct}
            />
            <StatCard
              icon={MessageSquare}
              label="Respostas"
              value={overview ? overview.totalReplied.toLocaleString('pt-BR') : '—'}
              numericValue={overview?.totalReplied}
              formatValue={(current) => Math.round(current).toLocaleString('pt-BR')}
              deltaPct={overview?.trends.repliesDeltaPct}
            />
            <StatCard
              icon={TrendingUp}
              label="Taxa de resposta"
              value={
                overview?.responseRate !== undefined ? formatPercent(overview.responseRate) : '—'
              }
              numericValue={overview?.responseRate}
              formatValue={formatPercent}
              deltaPct={overview?.trends.responseRateDeltaPct}
            />
          </motion.div>

          {/*
            Teto de carga atingido (auditoria 2026-08-22, P1.1) — mesma
            disciplina de `PipelineBoard`: a tabela mostra um recorte, não a
            sessão inteira, e isso precisa ser dito, nunca escondido.
          */}
          {truncated && (
            <p
              role="status"
              className="mb-3 rounded-md bg-warning/[.12] px-3 py-2 text-[12.5px] text-warning-emphasis"
            >
              Mostrando as {MAX_CAMPAIGNS_PAGES * 50} campanhas mais recentes desta sessão. As mais
              antigas não aparecem na tabela abaixo (os cards no topo continuam contando todas).
            </p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar campanha por nome…"
                aria-label="Buscar campanha por nome"
                className="h-[34px] rounded-[9px] border-border bg-panel pl-8 text-[13px]"
              />
            </div>

            <div className="relative" ref={filterMenuRef}>
              <Button
                type="button"
                variant="outline"
                size="cta"
                onClick={() => setFilterMenuOpen((open) => !open)}
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Filtros
              </Button>
              {filterMenuOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(option.key);
                        setFilterMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted',
                        statusFilter === option.key
                          ? 'font-medium text-primary'
                          : 'text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={sortMenuRef}>
              <Button
                type="button"
                variant="outline"
                size="cta"
                onClick={() => setSortMenuOpen((open) => !open)}
              >
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {SORT_OPTIONS.find((option) => option.key === sortOption)?.label}
              </Button>
              {sortMenuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSortOption(option.key);
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted',
                        sortOption === option.key ? 'font-medium text-primary' : 'text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              size="cta"
              className="shrink-0"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Nova campanha
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : errorMessage ? (
            <ErrorState description={errorMessage} onRetry={load} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title={rows.length === 0 ? 'Nenhuma campanha ainda' : 'Nenhuma campanha encontrada'}
              description={
                rows.length === 0
                  ? 'Crie a primeira campanha desta sessão — combine contatos salvos, planilha ou números digitados.'
                  : 'Tente outro termo de busca ou outro filtro.'
              }
              action={
                rows.length === 0 ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    Nova campanha
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* SEM `overflow-hidden` aqui de propósito (pedido do fundador,
                2026-08-18): esse container tinha `overflow-hidden` para
                arredondar os cantos, mas isso também cortava o menu "⋮" de
                cada linha (posicionado `absolute`, estoura o container) —
                nenhuma linha (nem o cabeçalho) tem `background` próprio, só
                o container tem `bg-card`, então os cantos continuam
                visualmente arredondados sem precisar recortar o conteúdo. */}
              <div
                className="rounded-lg border border-border bg-card"
                data-testid="campaigns-table"
              >
                {/*
                CORREÇÃO 2026-08-21 (achado real do fundador: "nada
                alinhado, nada bonito" — persistia mesmo depois de trocar
                `items-center` por `items-start`).

                CAUSA RAIZ verdadeira: cada linha era o SEU PRÓPRIO
                `<div className="grid ...">`, não linhas de uma grade
                compartilhada. O CSS Grid recalcula a largura de uma coluna
                `auto` (aqui, "Ações") de forma INDEPENDENTE por container —
                e a última coluna era `auto`, dimensionada pelo conteúdo de
                CADA linha: o cabeçalho só tem a palavra "Ações" (estreito);
                uma linha `completed` tinha o botão "Ver" + o menu "⋮" (mais
                largo); outra `running` tinha "Pausar" + "⋮" (largura
                diferente ainda). Como a coluna `auto` variava, o espaço
                que sobrava pras colunas `fr` (Destinatários/Enviados/
                Respostas/Criada em) também variava — cada linha desenhava
                essas colunas em posições X diferentes, tanto entre si
                quanto contra o cabeçalho.

                Corrigido com uma `<table>` de verdade: o algoritmo de
                layout de tabela do navegador SEMPRE calcula a largura de
                cada coluna olhando TODAS as linhas de uma vez (cabeçalho
                incluso) — é a garantia estrutural que o CSS Grid por-linha
                nunca teve.

                CORREÇÃO DE ACOMPANHAMENTO, mesmo dia — `overflow-x-auto`
                tinha sido posto aqui pensando em rolagem horizontal em
                telas estreitas, mas por regra do CSS, definir `overflow-x`
                para qualquer coisa diferente de `visible` faz o
                `overflow-y` (que estava `visible`) virar `auto` TAMBÉM —
                cortando verticalmente o menu "⋮" `absolute` de cada linha,
                que estoura o container por baixo (bug real relatado com
                print: o menu abria cortado/vazio). Exatamente o motivo que
                já tinha feito remover `overflow-hidden` em 2026-08-18 — aqui
                bastou nunca declarar `overflow` nenhum no container: numa
                tabela real, o alinhamento não depende disso.
              */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">Campanha</TableHead>
                      <TableHead className="px-4">Status</TableHead>
                      <TableHead className="px-4">Progresso</TableHead>
                      <TableHead className="px-4">Destinatários</TableHead>
                      <TableHead className="px-4">Enviados</TableHead>
                      <TableHead className="px-4">Respostas</TableHead>
                      <TableHead className="px-4">Criada em</TableHead>
                      <TableHead className="px-4 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.map(({ campaign, summary, metrics }) => {
                      const sentPlusReplied = metrics ? metrics.sent + metrics.replied : 0;
                      const progressPct =
                        summary && summary.total > 0
                          ? Math.round((sentPlusReplied / summary.total) * 100)
                          : 0;
                      const canStart = campaign.status === 'draft' || campaign.status === 'paused';
                      const canPause = campaign.status === 'running';
                      const canCancel =
                        campaign.status === 'draft' ||
                        campaign.status === 'running' ||
                        campaign.status === 'paused';
                      // Retrofit 2026-08-18 — só reabre quando há de fato alguém FAILED
                      // para tentar de novo (ex.: sessão do WhatsApp reconectando bem
                      // na hora do envio); nunca reenvia SKIPPED (opt-out etc.).
                      const canReopen =
                        (campaign.status === 'completed' || campaign.status === 'cancelled') &&
                        (metrics?.failed ?? 0) > 0;

                      return (
                        <TableRow key={campaign.id}>
                          <TableCell className="max-w-0 px-4 py-3 align-top">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <Megaphone className="h-4 w-4" aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-foreground">
                                  {campaign.name}
                                </p>
                                <p className="truncate text-[12px] text-muted-foreground">
                                  {campaign.description ?? formatDateTime(campaign.createdAt)}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                            <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>
                              <span
                                className={cn(
                                  'mr-1 inline-block h-1.5 w-1.5 rounded-full',
                                  STATUS_DOT_CLASS[campaign.status],
                                )}
                              />
                              {STATUS_LABELS[campaign.status]}
                            </Badge>
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top">
                            <div className="w-24">
                              <div className="mb-1 flex items-center justify-between text-[12px] text-foreground">
                                <span>{progressPct}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-success transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[13px] text-foreground">
                            {summary?.total ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[13px] text-foreground">
                            {metrics ? sentPlusReplied : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[13px] text-foreground">
                            {metrics?.replied ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[12.5px] text-muted-foreground">
                            {formatDateTime(campaign.createdAt)}
                          </TableCell>

                          <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                            <div className="flex shrink-0 items-center justify-end gap-1">
                              {canPause ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={actionPendingId === campaign.id}
                                  onClick={() =>
                                    void runAction(
                                      campaign,
                                      () => pauseCampaign(campaign.id),
                                      'Campanha pausada',
                                    )
                                  }
                                >
                                  <Pause className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                  Pausar
                                </Button>
                              ) : canStart ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={actionPendingId === campaign.id}
                                  onClick={() => setConfirmAction({ type: 'start', campaign })}
                                >
                                  <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                  {campaign.status === 'paused' ? 'Retomar' : 'Iniciar'}
                                </Button>
                              ) : null}
                              {/* Botão "Ver" removido (2026-08-21, pedido do fundador) — era
                            redundante com "Ver detalhes" do menu "⋮" logo abaixo, e
                            sua largura variável (presente só em campanhas sem ação
                            primária) era parte da causa da coluna "Ações" mudar de
                            largura entre linhas. */}

                              <div
                                className="relative"
                                ref={rowMenuId === campaign.id ? rowMenuRef : undefined}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Mais ações"
                                  onClick={() =>
                                    setRowMenuId((current) =>
                                      current === campaign.id ? null : campaign.id,
                                    )
                                  }
                                >
                                  <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                {rowMenuId === campaign.id && (
                                  <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                                    <Link
                                      href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/${encodeURIComponent(campaign.id)}`}
                                      className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                                      onClick={() => setRowMenuId(null)}
                                    >
                                      Ver detalhes
                                    </Link>
                                    {canCancel && (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                          setRowMenuId(null);
                                          setConfirmAction({ type: 'cancel', campaign });
                                        }}
                                      >
                                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                        Cancelar campanha
                                      </button>
                                    )}
                                    {canReopen && (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                                        onClick={() => {
                                          setRowMenuId(null);
                                          setConfirmAction({ type: 'reopen', campaign });
                                        }}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                        Reabrir campanha
                                      </button>
                                    )}
                                    {campaign.status !== 'running' && (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                          setRowMenuId(null);
                                          setConfirmAction({ type: 'delete', campaign });
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        Excluir campanha
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {filteredRows.length > 0 && (
                <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted-foreground">
                  <span>
                    Mostrando {pagedRows.length} de {filteredRows.length} campanha
                    {filteredRows.length === 1 ? '' : 's'}
                  </span>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page === 1}
                        aria-label="Página anterior"
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => setPage(pageNumber)}
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-medium',
                            pageNumber === page
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-muted',
                          )}
                        >
                          {pageNumber}
                        </button>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page === pageCount}
                        aria-label="Próxima página"
                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-4 xl:w-[300px]">
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-foreground">Progresso da campanha</p>
            </div>
            {overview && overview.totalSent > 0 ? (
              <div className="mt-3 flex items-center gap-4">
                <ResponseProgressDonut
                  totalSent={overview.totalSent}
                  totalReplied={overview.totalReplied}
                />
                <div className="flex-1 space-y-1.5 text-[12.5px]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-primary/30" />
                    <span className="text-foreground">Enviadas</span>
                    <span className="ml-auto text-muted-foreground">
                      {overview.totalSent.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-success" />
                    <span className="text-foreground">Respondidas</span>
                    <span className="ml-auto text-muted-foreground">
                      {overview.totalReplied.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-muted-foreground" />
                    <span className="text-foreground">Não respondidas</span>
                    <span className="ml-auto text-muted-foreground">
                      {(overview.totalSent - overview.totalReplied).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                Nenhuma mensagem enviada ainda nesta sessão.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold text-foreground">Status das campanhas</p>
            {overview && overview.totalCampaigns > 0 ? (
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground">Em andamento</span>
                  <span className="ml-auto text-muted-foreground">
                    {overview.statusCounts.running}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                  <span className="text-foreground">Concluídas</span>
                  <span className="ml-auto text-muted-foreground">
                    {overview.statusCounts.completed}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning" />
                  <span className="text-foreground">Pausadas</span>
                  <span className="ml-auto text-muted-foreground">
                    {overview.statusCounts.paused}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span className="text-foreground">Rascunho</span>
                  <span className="ml-auto text-muted-foreground">
                    {overview.statusCounts.draft + overview.statusCounts.scheduled}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />
                  <span className="text-foreground">Canceladas</span>
                  <span className="ml-auto text-muted-foreground">
                    {overview.statusCounts.cancelled}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Nenhuma campanha ainda.</p>
            )}
          </Card>
        </aside>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <CampaignCreateForm
            sessionName={sessionName}
            onCreated={load}
            onClose={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{CONFIRM_ACTION_COPY[confirmAction?.type ?? 'start'].title}</DialogTitle>
            <DialogDescription>
              {CONFIRM_ACTION_COPY[confirmAction?.type ?? 'start'].description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>
                Voltar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={CONFIRM_ACTION_COPY[confirmAction?.type ?? 'start'].variant}
              disabled={deleting}
              onClick={() => void handleConfirmedAction()}
            >
              {confirmAction?.type === 'delete' && deleting
                ? 'Excluindo…'
                : CONFIRM_ACTION_COPY[confirmAction?.type ?? 'start'].confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
