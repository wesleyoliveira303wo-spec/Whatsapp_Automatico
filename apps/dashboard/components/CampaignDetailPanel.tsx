import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Play, Pause, XCircle } from 'lucide-react';

import {
  fetchCampaign,
  fetchCampaignRecipients,
  fetchCampaignMetrics,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  ClientApiError,
  type Campaign,
  type CampaignRecipient,
  type CampaignRecipientSummary,
  type CampaignSkipReason,
  type CampaignMetrics,
  type CampaignLinkedConversationStage,
} from '@/lib/clientApi';
import { formatDateTime } from '@/lib/formatters';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    Promise.all([
      fetchCampaign(campaignId),
      fetchCampaignRecipients(campaignId, { limit: 100 }),
      fetchCampaignMetrics(campaignId),
    ])
      .then(([detail, recipientPage, metricsResult]) => {
        setCampaign(detail.campaign);
        setSummary(detail.summary);
        setRecipients(recipientPage.recipients);
        setMetrics(metricsResult.metrics);
      })
      .catch(() => setErrorMessage('Não foi possível carregar esta campanha.'))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

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
        <Badge
          variant={
            campaign.status === 'running'
              ? 'success'
              : campaign.status === 'paused'
                ? 'warning'
                : campaign.status === 'cancelled'
                  ? 'destructive'
                  : 'secondary'
          }
        >
          {campaign.status}
        </Badge>
      </div>
      <p className="mb-1 text-[13px] text-muted-foreground">
        Criada em {formatDateTime(campaign.createdAt)}
      </p>
      <p className="mb-4 max-w-2xl whitespace-pre-wrap rounded-lg border border-dashed border-border bg-card p-3 text-[13px] text-foreground">
        {campaign.messageTemplate}
      </p>

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
      </div>

      {campaign.pausedReason && (
        <p className="mb-4 text-[12.5px] text-warning-foreground">
          Pausada automaticamente: motivo &quot;{campaign.pausedReason}&quot;.
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Total</p>
          <p className="text-[18px] font-semibold text-foreground">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Pendentes</p>
          <p className="text-[18px] font-semibold text-foreground">{summary.pending}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Suprimidos</p>
          <p className="text-[18px] font-semibold text-foreground">{summary.skipped}</p>
        </div>
      </div>

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

      <h2 className="mb-2 text-[15px] font-semibold text-foreground">Destinatários</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {recipients.map((recipient, index) => (
          <div
            key={recipient.id}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] ${
              index < recipients.length - 1 ? 'border-b border-border/70' : ''
            }`}
          >
            <span className="truncate text-foreground">{recipient.contactId}</span>
            <span className="shrink-0 text-muted-foreground">
              {RECIPIENT_STATUS_LABELS[recipient.status]}
              {recipient.skipReason &&
                ` · ${SKIP_REASON_LABELS[recipient.skipReason as CampaignSkipReason] ?? recipient.skipReason}`}
              {recipient.errorMessage && ` · ${recipient.errorMessage}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
