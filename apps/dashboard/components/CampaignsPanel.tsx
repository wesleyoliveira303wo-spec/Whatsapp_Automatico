import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Send,
  MessageSquare,
  TrendingUp,
  Play,
  Pause,
  MoreVertical,
  XCircle,
  Trash2,
  RotateCcw,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
import BroadcastStatRow from '@/components/broadcasts/BroadcastStatRow';
import BroadcastToolbar from '@/components/broadcasts/BroadcastToolbar';
import BroadcastPagination from '@/components/broadcasts/BroadcastPagination';
import { useBroadcastListControls } from '@/hooks/useBroadcastListControls';
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
    title: 'Cancelar este disparo?',
    description:
      'Ação definitiva — um disparo cancelado não pode ser retomada. Destinatários ainda pendentes não receberão mensagem nenhuma.',
    confirmLabel: 'Confirmar cancelamento',
    variant: 'destructive',
  },
  delete: {
    title: 'Excluir este disparo?',
    description:
      'Ação definitiva e irreversível — o disparo e todos os seus destinatários serão apagados permanentemente. Mensagens já enviadas continuam entregues, mas o histórico deste disparo some.',
    confirmLabel: 'Excluir',
    variant: 'destructive',
  },
  // Retrofit 2026-08-18 — "reiniciar/refazer um disparo".
  reopen: {
    title: 'Reabrir este disparo?',
    description:
      'Isto vai tentar enviar de novo para quem falhou (ex.: uma instabilidade momentânea na conexão do WhatsApp) — mensagens reais. Quem foi suprimido por opt-out, conversa já com um atendente, ou contato recente por outro disparo nunca é reenviado.',
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


/**
 * Teto de páginas de carregamento (auditoria 2026-08-22, P1.1). Antes desta
 * rodada `load()` buscava só a PRIMEIRA página (`fetchCampaigns({limit:50})`)
 * e tratava como se fosse tudo — o card do topo ("Total de disparos") vem
 * de `GET /campaigns/overview`, agregado no servidor sobre TODAS as
 * disparos da sessão, então uma sessão com mais de 50 disparos mostrava um
 * total no card que a tabela (e a busca/filtro/paginação client-side sobre
 * ela) nunca conseguia alcançar — sem nenhum aviso. Mesmo remédio já usado
 * em `usePipelineConversations` (`MAX_PIPELINE_PAGES`): acumula por cursor
 * até esgotar ou bater o teto, e avisa (`truncated`) em vez de mentir por
 * omissão. 10 páginas × 50 = 500 disparos, folga generosa sobre o volume
 * real (criar disparo é ação deliberada de administrador, não algo que
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
    if (error.status === 403) return 'Seu cargo não permite gerenciar disparos.';
    if (error.status === 503) return 'O motor de envio não está configurado neste ambiente.';
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}



function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Lista de disparos de uma sessão — retrofit visual 2026-08-18, 2ª rodada
 * (réplica exata de imagem do fundador). Fase L, Blocos L3/L4/L7.
 *
 * Cards do topo, o donut "Progresso do disparo" e a lista "Status das
 * disparos" vêm de `GET /campaigns/overview` (agregado no servidor, sobre
 * TODAS os disparos da sessão — não só a página carregada/filtrada). A
 * tabela acumula `fetchCampaigns` por cursor até esgotar ou bater
 * `MAX_CAMPAIGNS_PAGES` (auditoria 2026-08-22, P1.1 — ver docstring da
 * constante) + `fetchCampaign`/`fetchCampaignMetrics` por disparo em
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
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'start' | 'cancel' | 'delete' | 'reopen';
    campaign: Campaign;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      .catch(() => setErrorMessage('Não foi possível carregar os disparos.'))
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

  // Busca, filtro, ordenação e paginação vivem no hook compartilhado com a
  // aba "Para grupos" (Revisão de Disparos, 2026-09-12): as duas telas usam a
  // MESMA mecânica, então uma correção conserta as duas.
  const controls = useBroadcastListControls<CampaignRow, CampaignStatus | 'all', SortOption>({
    rows,
    searchText: (row) => row.campaign.name,
    matchesFilter: (row, filter) => filter === 'all' || row.campaign.status === filter,
    compare: (a, b, sort) => {
      if (sort === 'name') return a.campaign.name.localeCompare(b.campaign.name, 'pt-BR');
      const first = new Date(a.campaign.createdAt).getTime();
      const second = new Date(b.campaign.createdAt).getTime();
      return sort === 'oldest' ? first - second : second - first;
    },
    initialFilter: 'all',
    initialSort: 'recent',
  });
  const { search, setSearch, page, setPage, filteredRows, pagedRows, pageCount } = controls;
  const statusFilter = controls.filter;
  const setStatusFilter = controls.setFilter;
  const sortOption = controls.sort;
  const setSortOption = controls.setSort;

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
        campaign.status === 'paused' ? 'Disparo retomado' : 'Disparo iniciado',
      );
    } else if (type === 'cancel') {
      await runAction(campaign, () => cancelCampaign(campaign.id), 'Disparo cancelado');
    } else if (type === 'reopen') {
      await runAction(campaign, () => reopenCampaign(campaign.id), 'Disparo reaberta');
    } else {
      setDeleting(true);
      try {
        await deleteCampaign(campaign.id);
        toast({ variant: 'success', title: 'Disparo excluído' });
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
      <BroadcastStatRow
        testId="campaigns-stat-cards"
        stats={[
          {
            icon: Megaphone,
            label: 'Disparos criados',
            value: overview ? String(overview.totalCampaigns) : '—',
            numericValue: overview?.totalCampaigns,
            deltaPct: overview?.trends.campaignsDeltaPct,
          },
          {
            icon: Send,
            label: 'Mensagens enviadas',
            value: overview ? overview.totalSent.toLocaleString('pt-BR') : '—',
            numericValue: overview?.totalSent,
            formatValue: (current: number) => Math.round(current).toLocaleString('pt-BR'),
            deltaPct: overview?.trends.messagesSentDeltaPct,
          },
          {
            icon: MessageSquare,
            label: 'Respostas',
            value: overview ? overview.totalReplied.toLocaleString('pt-BR') : '—',
            numericValue: overview?.totalReplied,
            formatValue: (current: number) => Math.round(current).toLocaleString('pt-BR'),
            deltaPct: overview?.trends.repliesDeltaPct,
          },
          {
            icon: TrendingUp,
            label: 'Taxa de resposta',
            value:
              overview?.responseRate !== undefined ? formatPercent(overview.responseRate) : '—',
            numericValue: overview?.responseRate,
            formatValue: formatPercent,
            deltaPct: overview?.trends.responseRateDeltaPct,
          },
        ]}
      />

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
              Mostrando as {MAX_CAMPAIGNS_PAGES * 50} disparos mais recentes desta sessão. As mais
              antigas não aparecem na tabela abaixo (os cards no topo continuam contando todas).
            </p>
          )}

      <BroadcastToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Buscar disparo por nome"
        filterOptions={FILTER_OPTIONS}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        sortOptions={SORT_OPTIONS}
        sortValue={sortOption}
        onSortChange={setSortOption}
        actionLabel="Novo disparo"
        onAction={() => setCreateOpen(true)}
      />

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
              title={rows.length === 0 ? 'Nenhum disparo ainda' : 'Nenhum disparo encontrado'}
              description={
                rows.length === 0
                  ? 'Crie a primeiro disparo desta sessão — combine contatos salvos, planilha ou números digitados.'
                  : 'Tente outro termo de busca ou outro filtro.'
              }
              action={
                rows.length === 0 ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    Novo disparo
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
                Respostas/Criado em) também variava — cada linha desenhava
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
                      <TableHead className="px-4">Disparo</TableHead>
                      <TableHead className="px-4">Status</TableHead>
                      <TableHead className="px-4">Progresso</TableHead>
                      <TableHead className="px-4">Destinatários</TableHead>
                      <TableHead className="px-4">Enviados</TableHead>
                      <TableHead className="px-4">Respostas</TableHead>
                      <TableHead className="px-4">Criado em</TableHead>
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
                                      'Disparo pausado',
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
                            sua largura variável (presente só em disparos sem ação
                            primária) era parte da causa da coluna "Ações" mudar de
                            largura entre linhas. */}

                              {/*
                                `modal={false}` NÃO é cosmético: três itens
                                deste menu abrem um `Dialog` de confirmação.
                                Com o menu em modo modal (padrão), o Radix
                                monta a trava de rolagem + `aria-hidden` do
                                menu e, no MESMO tique, o `Dialog` monta a
                                dele — as duas camadas de modalidade entram em
                                laço infinito e o processo trava de vez
                                (medido: `fireEvent.click` no item de menu
                                nunca retorna, worker de teste girando com
                                2.500s de CPU). Um menu de ações pequeno não
                                precisa de modalidade própria; quem prende o
                                foco é o diálogo que ele abre.
                              */}
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label="Mais ações"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/${encodeURIComponent(campaign.id)}`}
                                      className="text-foreground"
                                    >
                                      Ver detalhes
                                    </Link>
                                  </DropdownMenuItem>
                                  {canCancel && (
                                    <DropdownMenuItem asChild>
                                      <button
                                        type="button"
                                        className="gap-2 text-destructive focus:bg-destructive/10"
                                        onClick={() => setConfirmAction({ type: 'cancel', campaign })}
                                      >
                                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                        Cancelar disparo
                                      </button>
                                    </DropdownMenuItem>
                                  )}
                                  {canReopen && (
                                    <DropdownMenuItem asChild>
                                      <button
                                        type="button"
                                        className="gap-2 text-foreground"
                                        onClick={() => setConfirmAction({ type: 'reopen', campaign })}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                        Reabrir disparo
                                      </button>
                                    </DropdownMenuItem>
                                  )}
                                  {campaign.status !== 'running' && (
                                    <DropdownMenuItem asChild>
                                      <button
                                        type="button"
                                        className="gap-2 text-destructive focus:bg-destructive/10"
                                        onClick={() => setConfirmAction({ type: 'delete', campaign })}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        Excluir disparo
                                      </button>
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {filteredRows.length > 0 && (
                <BroadcastPagination
                  showing={pagedRows.length}
                  total={filteredRows.length}
                  page={page}
                  pageCount={pageCount}
                  onPageChange={setPage}
                  noun="disparo"
                />
              )}
            </>
          )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo disparo</DialogTitle>
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
