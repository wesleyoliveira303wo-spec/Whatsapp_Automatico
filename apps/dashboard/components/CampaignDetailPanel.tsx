import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Play, Pause, XCircle, RotateCcw, FileText, X } from 'lucide-react';

import {
  fetchCampaign,
  fetchCampaignRecipients,
  fetchCampaignMetrics,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  reopenCampaign,
  removeCampaignMedia,
  campaignMediaUrl,
  ClientApiError,
  type Campaign,
  type CampaignStatus,
  type CampaignRecipient,
  type CampaignRecipientSummary,
  type CampaignSkipReason,
  type CampaignMetrics,
  type CampaignLinkedConversationStage,
} from '@/lib/clientApi';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatDateTime, formatPersonLabelParts, type PersonDisplayParts } from '@/lib/formatters';
import DisplayNameParts from '@/components/DisplayNameParts';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import ErrorState from '@/components/states/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface CampaignDetailPanelProps {
  sessionName: string;
  campaignId: string;
}

const SKIP_REASON_LABELS: Record<CampaignSkipReason, string> = {
  opt_out: 'Pediram para não receber mais campanhas',
  active_human_conversation: 'Já estão sendo atendidos por um humano',
  recently_contacted: 'Contatados por outra campanha há menos de 7 dias',
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em execução',
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

const RECIPIENT_STATUS_LABELS: Record<CampaignRecipient['status'], string> = {
  pending: 'Aguardando envio',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Suprimido',
  replied: 'Respondeu',
};

const STAGE_LABELS: Record<CampaignLinkedConversationStage, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  negotiating: 'Negociando',
  closed_won: 'Fechado',
  closed_lost: 'Perdido',
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMinutes(value: number): string {
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours}h${minutes}min` : `${hours}h`;
}

function formatUsd(value: number): string {
  return `US$ ${value.toFixed(4)}`;
}

/**
 * Padronização de exibição de contato (2026-08-20) — mesma regra de
 * `labelFor` (`ContactsPanel`)/`formatContactDisplayName`: nome salvo sozinho
 * quando houver; senão telefone (obrigatório) + apelido do WhatsApp, se a API
 * tiver resolvido um. Corrige o bug anterior: um destinatário vinculado a um
 * Contato sem nome salvo (`recipient.contact` sem `name`) caía direto no
 * `contactId` cru — um UUID sem sentido nenhum para o operador.
 */
function partsForRecipient(recipient: CampaignRecipient): PersonDisplayParts {
  if (recipient.contact) {
    return formatPersonLabelParts({
      phoneE164: recipient.contact.phoneE164,
      savedName: recipient.contact.name,
      nickname: recipient.contact.nickname,
    });
  }
  if (recipient.phoneE164) {
    return formatPersonLabelParts({ phoneE164: recipient.phoneE164, nickname: recipient.name });
  }
  return { primary: 'Contato removido' };
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar campanhas.';
    if (error.status === 503) {
      return 'O motor de envio não está configurado neste ambiente.';
    }
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/**
 * Detalhe de uma campanha — Fase L, Bloco L4: resumo (elegíveis/suprimidos),
 * lista de destinatários, e as ações do motor de envio (iniciar/pausar/
 * cancelar). "Iniciar" pede confirmação explícita — é a única ação deste
 * produto que dispara mensagens reais em lote.
 */
export default function CampaignDetailPanel({
  sessionName,
  campaignId,
}: CampaignDetailPanelProps): JSX.Element {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [summary, setSummary] = useState<CampaignRecipientSummary | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  /**
   * Paginação real dos destinatários (auditoria 2026-08-22). Antes esta tela
   * buscava `{ limit: 100 }` uma única vez, sem cursor, sem botão e sem
   * contagem no título: uma campanha de 5.000 destinatários (o teto de
   * importação) mostrava 100 e omitia 4.900 SEM nenhuma indicação na tela —
   * perda silenciosa de dado. A API já suportava `cursor`/`nextCursor` desde
   * o L3; só a UI não usava.
   */
  const [recipientsCursor, setRecipientsCursor] = useState<string | undefined>(undefined);
  const [loadingMoreRecipients, setLoadingMoreRecipients] = useState(false);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  // CORREÇÃO 2026-08-18 (pedido do fundador): a tela de detalhe não
  // atualizava sozinha enquanto uma campanha estava em execução — só um F5
  // manual mostrava o progresso real (destinatários enviados subindo). Ref
  // (não estado) para o polling silencioso ler o status ATUAL sem precisar
  // entrar nas deps de `fetchAll`/recriar o callback a cada mudança.
  const campaignStatusRef = useRef<CampaignStatus | undefined>(undefined);

  const fetchAll = useCallback(
    (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setErrorMessage(null);
      }
      return Promise.all([
        fetchCampaign(campaignId),
        fetchCampaignRecipients(campaignId, { limit: 100 }),
        fetchCampaignMetrics(campaignId),
      ])
        .then(([detail, recipientPage, metricsResult]) => {
          campaignStatusRef.current = detail.campaign.status;
          setCampaign(detail.campaign);
          setSummary(detail.summary);
          setMetrics(metricsResult.metrics);

          if (silent) {
            // Polling durante o envio: atualiza o STATUS dos destinatários que
            // voltaram na primeira página, mas preserva as páginas extras que
            // o operador já tenha carregado — substituir a lista inteira
            // apagaria a rolagem dele a cada 4s. O cursor também não é
            // tocado, pelo mesmo motivo.
            const refreshedById = new Map(
              recipientPage.recipients.map((recipient) => [recipient.id, recipient]),
            );
            setRecipients((current) =>
              current.length > recipientPage.recipients.length
                ? current.map((recipient) => refreshedById.get(recipient.id) ?? recipient)
                : recipientPage.recipients,
            );
            return;
          }

          setRecipients(recipientPage.recipients);
          setRecipientsCursor(recipientPage.nextCursor);
        })
        .catch(() => {
          // Falha num refresh SILENCIOSO (polling) não deve substituir a
          // tela já carregada por um estado de erro — só a carga inicial
          // (não silenciosa) mostra o `ErrorState`.
          if (!silent) setErrorMessage('Não foi possível carregar esta campanha.');
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [campaignId],
  );

  const load = useCallback(() => {
    void fetchAll(false);
  }, [fetchAll]);

  /** Próxima página de destinatários — acumula, dedupe por `id` (mesmo padrão de `mergeConversationPages`). */
  const loadMoreRecipients = useCallback(() => {
    if (!recipientsCursor || loadingMoreRecipients) return;
    setLoadingMoreRecipients(true);
    fetchCampaignRecipients(campaignId, { limit: 100, cursor: recipientsCursor })
      .then((page) => {
        setRecipients((current) => {
          const known = new Set(current.map((recipient) => recipient.id));
          return [...current, ...page.recipients.filter((recipient) => !known.has(recipient.id))];
        });
        setRecipientsCursor(page.nextCursor);
      })
      .catch(() => {
        toast({
          variant: 'destructive',
          title: 'Não foi possível carregar mais destinatários',
          description: 'Tente novamente em instantes.',
        });
      })
      .finally(() => {
        setLoadingMoreRecipients(false);
      });
  }, [campaignId, recipientsCursor, loadingMoreRecipients]);

  const silentRefresh = useCallback(() => {
    // Só atualiza sozinho enquanto a campanha está de fato disparando —
    // parada/concluída não tem progresso novo para mostrar, sem sentido
    // continuar batendo na API a cada poll.
    if (campaignStatusRef.current !== 'running') return;
    void fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  usePollingRefresh(silentRefresh);

  async function runAction(
    action: () => Promise<{ campaign: Campaign }>,
    successMessage: string,
  ): Promise<void> {
    setActionPending(true);
    try {
      const result = await action();
      setCampaign(result.campaign);
      toast({ variant: 'success', title: successMessage });
      load(); // recarrega resumo/destinatários — o motor pode ter concluído de imediato (ex.: 0 pendentes).
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível concluir',
        description: errorMessageFor(error),
      });
    } finally {
      setActionPending(false);
    }
  }

  async function handleRemoveMedia(): Promise<void> {
    setActionPending(true);
    try {
      const result = await removeCampaignMedia(campaignId);
      setCampaign(result.campaign);
      toast({ variant: 'success', title: 'Anexo removido' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível remover o anexo',
        description: errorMessageFor(error),
      });
    } finally {
      setActionPending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }
  if (errorMessage || !campaign || !summary) {
    return <ErrorState description={errorMessage ?? 'Campanha não encontrada.'} onRetry={load} />;
  }

  const canStart = campaign.status === 'draft' || campaign.status === 'paused';
  const canPause = campaign.status === 'running';
  const canCancel =
    campaign.status === 'draft' || campaign.status === 'running' || campaign.status === 'paused';
  // Retrofit 2026-08-18 — "não existe nenhum botão onde podemos reiniciar ou
  // refazer uma campanha": só faz sentido reabrir quando há de fato alguém
  // FAILED para tentar de novo (ex.: a sessão do WhatsApp reconectando bem na
  // hora do envio) — sem isso, o botão nunca teria efeito.
  const canReopen =
    (campaign.status === 'completed' || campaign.status === 'cancelled') &&
    (metrics?.failed ?? 0) > 0;

  return (
    <div>
      <Link
        href={`/sessions/${encodeURIComponent(sessionName)}/campaigns`}
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Campanhas
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
          {campaign.name}
        </h1>
        <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>
          {STATUS_LABELS[campaign.status]}
        </Badge>
      </div>
      <p className="mb-1 text-[13px] text-muted-foreground">
        Criada em {formatDateTime(campaign.createdAt)}
      </p>
      {campaign.description && (
        <p className="mb-2 max-w-2xl text-[13px] text-muted-foreground">{campaign.description}</p>
      )}
      <p className="mb-2 max-w-2xl whitespace-pre-wrap rounded-lg border border-dashed border-border bg-card p-3 text-[13px] text-foreground">
        {campaign.messageTemplate}
      </p>

      {/* Fase L, Bloco L8 — mídia anexada. Só pode ser removida enquanto a
          campanha ainda é `draft` (a mensagem já enviada não muda de anexo
          no meio do disparo). */}
      {campaign.media && (
        <div className="mb-4 flex max-w-2xl items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {campaign.media.contentType === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- proxy do BFF, não um asset estático local (mesmo padrão de MessageBubble).
              <img
                src={campaignMediaUrl(campaignId)}
                alt="Anexo da campanha"
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">
                {campaign.media.fileName ?? campaign.media.contentType}
              </p>
              <p className="text-[12px] text-muted-foreground">{campaign.media.contentType}</p>
            </div>
          </div>
          {campaign.status === 'draft' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remover anexo"
              disabled={actionPending}
              onClick={() => void handleRemoveMedia()}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
          <Button
            type="button"
            size="cta"
            disabled={!canStart || actionPending}
            onClick={() => setStartDialogOpen(true)}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {campaign.status === 'paused' ? 'Retomar envio' : 'Iniciar envio'}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar disparo real</DialogTitle>
              <DialogDescription>
                Isto vai enviar mensagens de WhatsApp reais para até{' '}
                <strong>{summary.pending}</strong> contato(s) pendente(s), com ritmo espaçado. Você
                poderá pausar a qualquer momento, mas mensagens já enviadas não podem ser desfeitas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={actionPending}
                onClick={() => {
                  setStartDialogOpen(false);
                  void runAction(
                    () => startCampaign(campaignId),
                    campaign.status === 'paused' ? 'Campanha retomada' : 'Campanha iniciada',
                  );
                }}
              >
                Confirmar e enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          disabled={!canPause || actionPending}
          onClick={() => void runAction(() => pauseCampaign(campaignId), 'Campanha pausada')}
        >
          <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Pausar
        </Button>

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <Button
            type="button"
            variant="outline"
            disabled={!canCancel || actionPending}
            onClick={() => setCancelDialogOpen(true)}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Cancelar campanha
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar esta campanha?</DialogTitle>
              <DialogDescription>
                Ação definitiva — uma campanha cancelada não pode ser retomada. Destinatários ainda
                pendentes não receberão mensagem nenhuma.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Voltar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={actionPending}
                onClick={() => {
                  setCancelDialogOpen(false);
                  void runAction(() => cancelCampaign(campaignId), 'Campanha cancelada');
                }}
              >
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
          <Button
            type="button"
            variant="outline"
            disabled={!canReopen || actionPending}
            onClick={() => setReopenDialogOpen(true)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Reabrir campanha
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reabrir esta campanha?</DialogTitle>
              <DialogDescription>
                Isto vai tentar enviar de novo para <strong>{metrics?.failed ?? 0}</strong>{' '}
                contato(s) que falharam (ex.: uma instabilidade momentânea na conexão do WhatsApp) —
                mensagens de WhatsApp reais. Quem foi suprimido por opt-out, conversa já com um
                atendente, ou contato recente por outra campanha NUNCA é reenviado.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Voltar
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={actionPending}
                onClick={() => {
                  setReopenDialogOpen(false);
                  void runAction(() => reopenCampaign(campaignId), 'Campanha reaberta');
                }}
              >
                Confirmar e reenviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {campaign.pausedReason && (
        <p className="mb-4 text-[12.5px] text-warning-foreground">
          Pausada automaticamente: motivo &quot;{campaign.pausedReason}&quot;.
        </p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Total</p>
          <p className="text-[18px] font-semibold text-foreground">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Pendentes</p>
          <p className="text-[18px] font-semibold text-foreground">
            {metrics?.pending ?? summary.pending}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Enviados</p>
          <p className="text-[18px] font-semibold text-foreground">{metrics?.sent ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Falhas</p>
          <p className="text-[18px] font-semibold text-foreground">{metrics?.failed ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Suprimidos</p>
          <p className="text-[18px] font-semibold text-foreground">{summary.skipped}</p>
        </div>
      </div>

      {/* Progresso de envio — só faz sentido depois de "Iniciar envio" ter
          rodado ao menos uma tentativa (sent+failed+replied > 0); antes
          disso, uma barra em 0% não acrescenta nada. Não inventa confirmação
          de ENTREGA (o WhatsApp não fornece essa informação) — mede só o que
          o produto de fato sabe: quantos dos destinatários elegíveis já
          tiveram um envio TENTADO. */}
      {metrics && summary.total - summary.skipped > 0 && (
        <div className="mb-4">
          {(() => {
            const eligible = summary.total - summary.skipped;
            const attempted = metrics.sent + metrics.failed + metrics.replied;
            return attempted > 0 ? (
              <>
                <div className="mb-1 flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>Progresso do envio</span>
                  <span>
                    {attempted} de {eligible}
                  </span>
                </div>
                <Progress value={(attempted / eligible) * 100} />
              </>
            ) : null;
          })()}
        </div>
      )}

      {summary.skipped > 0 && (
        <ul className="mb-5 space-y-1 text-[12.5px] text-muted-foreground">
          {(Object.keys(summary.skipReasons) as CampaignSkipReason[]).map((reason) => (
            <li key={reason} className="list-disc pl-4">
              {SKIP_REASON_LABELS[reason]}:{' '}
              <strong className="text-foreground">{summary.skipReasons[reason]}</strong>
            </li>
          ))}
        </ul>
      )}

      {metrics && (
        <div className="mb-5">
          <h2 className="mb-2 text-[15px] font-semibold text-foreground">Métricas</h2>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">Taxa de resposta</p>
              <p className="text-[18px] font-semibold text-foreground">
                {metrics.responseRate !== undefined ? formatPercent(metrics.responseRate) : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">Tempo até 1ª resposta</p>
              <p className="text-[18px] font-semibold text-foreground">
                {metrics.avgTimeToFirstReplyMinutes !== undefined
                  ? formatMinutes(metrics.avgTimeToFirstReplyMinutes)
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">Taxa de conversão</p>
              <p className="text-[18px] font-semibold text-foreground">
                {metrics.conversionRate !== undefined ? formatPercent(metrics.conversionRate) : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">Custo de IA por conversão</p>
              <p className="text-[18px] font-semibold text-foreground">
                {metrics.costPerConversionUsd !== undefined
                  ? formatUsd(metrics.costPerConversionUsd)
                  : '—'}
              </p>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(metrics.stageCounts) as CampaignLinkedConversationStage[]).map(
              (stage) => (
                <Badge key={stage} variant="secondary">
                  {STAGE_LABELS[stage]}: {metrics.stageCounts[stage]}
                </Badge>
              ),
            )}
            {metrics.escalatedCount > 0 && (
              <Badge variant="warning">Escalado para humano: {metrics.escalatedCount}</Badge>
            )}
          </div>

          {metrics.unknownAnswerCount > 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              A IA não soube responder <strong>{metrics.unknownAnswerCount}</strong> vez(es) em
              conversas desta campanha.
            </p>
          )}
        </div>
      )}

      {/*
        Contagem no título (auditoria 2026-08-22): sem ela, a lista truncada
        em 100 parecia a lista completa. `summary.total` é o número real de
        destinatários materializados da campanha.
      */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">Destinatários</h2>
        {summary && (
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
            {recipients.length < summary.total
              ? `${recipients.length} de ${summary.total}`
              : `${summary.total}`}
          </span>
        )}
      </div>
      {/*
        Onda 1 do redesign (2026-08-22) — era uma lista de `<div>`s sem
        nenhum cabeçalho de coluna (um leitor de tela nunca sabia que a 2ª
        "coluna" era status). Migrada para `<table>` de verdade via o
        primitivo unificado (`ui/table.tsx`) — mesmo padrão agora usado por
        `UserManagementPanel`/`AuditLogPanel`/`CampaignsPanel`. Sem menu
        suspenso em nenhuma linha aqui (destinatário é só leitura), então
        `overflow-hidden` no container é seguro (arredonda os cantos sem
        risco do bug de clipping das outras tabelas).
      */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Destinatário</TableHead>
              <TableHead className="px-4 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell className="px-4 align-top">
                  <p className="truncate text-[13px] text-foreground">
                    <DisplayNameParts {...partsForRecipient(recipient)} />
                  </p>
                  {(recipient.sentAt || recipient.repliedAt) && (
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {recipient.sentAt && `Enviado em ${formatDateTime(recipient.sentAt)}`}
                      {recipient.sentAt && recipient.repliedAt && ' · '}
                      {recipient.repliedAt && `Respondeu em ${formatDateTime(recipient.repliedAt)}`}
                    </p>
                  )}
                </TableCell>
                <TableCell className="px-4 align-top text-right text-[13px] text-muted-foreground">
                  {RECIPIENT_STATUS_LABELS[recipient.status]}
                  {recipient.skipReason &&
                    ` · ${SKIP_REASON_LABELS[recipient.skipReason as CampaignSkipReason] ?? recipient.skipReason}`}
                  {recipient.errorMessage && ` · ${recipient.errorMessage}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {recipientsCursor && (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={loadMoreRecipients}
            disabled={loadingMoreRecipients}
          >
            {loadingMoreRecipients ? 'Carregando…' : 'Carregar mais destinatários'}
          </Button>
        </div>
      )}
    </div>
  );
}
