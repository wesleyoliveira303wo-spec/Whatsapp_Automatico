import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronLeft, Play, Pause, XCircle, FileText, X, Users, Repeat, Pencil } from 'lucide-react';

import {
  fetchGroupBroadcast,
  startGroupBroadcast,
  pauseGroupBroadcast,
  cancelGroupBroadcast,
  removeGroupBroadcastStepMedia,
  groupBroadcastStepMediaUrl,
  ClientApiError,
  type GroupBroadcast,
  type GroupBroadcastStep,
  type GroupBroadcastStatus,
  type GroupBroadcastTarget,
  type GroupBroadcastStepTarget,
  type GroupBroadcastTargetStatus,
  type GroupBroadcastSummary,
  type ResumeMode,
} from '@/lib/clientApi';
import GroupBroadcastCreateForm from '@/components/GroupBroadcastCreateForm';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatDateTime } from '@/lib/formatters';
import { flattenStepTargetsForDisplay, lastSentAtForStep } from '@/lib/groupBroadcastView';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { COLUMN_FROM_SM } from '@/components/broadcasts/responsiveColumns';
import { cn } from '@/lib/utils';

interface GroupBroadcastDetailPanelProps {
  sessionName: string;
  broadcastId: string;
}

const STATUS_LABELS: Record<GroupBroadcastStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  running: 'Em execução',
  paused: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const STATUS_BADGE_VARIANT: Record<
  GroupBroadcastStatus,
  'secondary' | 'success' | 'warning' | 'default' | 'destructive'
> = {
  draft: 'secondary',
  scheduled: 'secondary',
  running: 'success',
  paused: 'warning',
  completed: 'default',
  cancelled: 'destructive',
};

const TARGET_STATUS_LABELS: Record<GroupBroadcastTargetStatus, string> = {
  pending: 'Aguardando envio',
  sent: 'Publicado',
  failed: 'Falhou',
  skipped: 'Suprimido',
};

const TARGET_STATUS_BADGE_VARIANT: Record<
  GroupBroadcastTargetStatus,
  'secondary' | 'success' | 'warning' | 'destructive'
> = {
  pending: 'secondary',
  sent: 'success',
  failed: 'destructive',
  skipped: 'warning',
};

const SKIP_REASON_LABELS: Record<string, string> = {
  admin_only_group: 'Só administradores podem publicar neste grupo',
  group_not_found: 'O número não participa mais deste grupo',
};

/**
 * Texto da coluna Detalhe — um lugar só, usado na coluna (desktop) e abaixo
 * do nome (celular). Lê `GroupBroadcastStepTarget` (o progresso REAL de um
 * grupo numa publicação), não `GroupBroadcastTarget` (só a elegibilidade
 * congelada na criação, que nunca teve isso pra mostrar).
 */
function targetDetail(target: GroupBroadcastStepTarget): string | null {
  if (target.status === 'skipped' && target.skipReason) {
    return SKIP_REASON_LABELS[target.skipReason] ?? target.skipReason;
  }
  if (target.status === 'failed') return target.errorMessage ?? null;
  if (target.status === 'sent' && target.sentAt) return formatDateTime(target.sentAt);
  return null;
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar disparos em grupos.';
    if (error.status === 503) return 'O motor de envio não está configurado neste ambiente.';
    if (error.status === 409) {
      const message = (error.body as { message?: string } | undefined)?.message;
      return message ?? 'Já existe outro disparo em grupos em andamento nesta sessão.';
    }
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/**
 * Detalhe de um disparo em grupos (2026-09-11) — resumo, anexo, status por
 * grupo (com polling enquanto `running`) e as ações do motor de envio.
 * "Iniciar" pede confirmação explícita, nomeando quantos grupos e o risco —
 * é a única ação deste fluxo que publica mensagens reais em lote.
 */
export default function GroupBroadcastDetailPanel({
  sessionName,
  broadcastId,
}: GroupBroadcastDetailPanelProps): JSX.Element {
  const [broadcast, setBroadcast] = useState<GroupBroadcast | null>(null);
  const [steps, setSteps] = useState<GroupBroadcastStep[]>([]);
  const [summary, setSummary] = useState<GroupBroadcastSummary | null>(null);
  const [targets, setTargets] = useState<GroupBroadcastTarget[]>([]);
  const [stepTargets, setStepTargets] = useState<Record<string, GroupBroadcastStepTarget[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [resumeMode, setResumeMode] = useState<ResumeMode>('now');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [pauseAndEditConfirmOpen, setPauseAndEditConfirmOpen] = useState(false);
  const router = useRouter();

  // Mesmo padrão de `CampaignDetailPanel`: ref (não estado) para o polling
  // silencioso ler o status ATUAL sem recriar o callback a cada mudança.
  const statusRef = useRef<GroupBroadcastStatus | undefined>(undefined);

  const fetchAll = useCallback(
    (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setErrorMessage(null);
      }
      return fetchGroupBroadcast(broadcastId)
        .then((detail) => {
          statusRef.current = detail.broadcast.status;
          setBroadcast(detail.broadcast);
          setSteps(detail.steps);
          setSummary(detail.summary);
          setTargets(detail.targets);
          setStepTargets(detail.stepTargets);
        })
        .catch(() => {
          if (!silent) setErrorMessage('Não foi possível carregar este disparo.');
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [broadcastId],
  );

  const load = useCallback(() => {
    void fetchAll(false);
  }, [fetchAll]);

  const silentRefresh = useCallback(() => {
    // Só atualiza sozinho enquanto o disparo está de fato publicando —
    // parado/concluído não tem progresso novo para mostrar.
    if (statusRef.current !== 'running') return;
    void fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  usePollingRefresh(silentRefresh);

  // Item "Editar" no menu "⋮" da lista (2026-09-15) navega para cá com
  // `?edit=1` — abre o diálogo de edição direto, sem um 2º clique. Só
  // dispara se o status ainda aceitar edição (o botão "Editar" cuida do
  // resto); a query é limpa em seguida para não reabrir num F5/voltar.
  useEffect(() => {
    if (!broadcast || router.query.edit !== '1') return;
    if (broadcast.status === 'draft' || broadcast.status === 'paused') {
      setEditDialogOpen(true);
    }
    const { edit: _edit, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o disparo carrega/a query muda.
  }, [broadcast, router.query.edit]);

  async function runAction(
    action: () => Promise<{ broadcast: GroupBroadcast }>,
    successMessage: string,
  ): Promise<void> {
    setActionPending(true);
    try {
      const result = await action();
      setBroadcast(result.broadcast);
      toast({ variant: 'success', title: successMessage });
      load();
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

  async function handleRemoveStepMedia(stepId: string): Promise<void> {
    setActionPending(true);
    try {
      const result = await removeGroupBroadcastStepMedia(broadcastId, stepId);
      setSteps((current) => current.map((step) => (step.id === stepId ? result.step : step)));
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
  if (errorMessage || !broadcast || !summary) {
    return <ErrorState description={errorMessage ?? 'Disparo não encontrado.'} onRetry={load} />;
  }

  const canStart = broadcast.status === 'draft' || broadcast.status === 'paused';
  const canPause = broadcast.status === 'running';
  const canCancel =
    broadcast.status === 'draft' || broadcast.status === 'running' || broadcast.status === 'paused';
  // Mais de uma etapa, ou a etapa atual repete — "quanto falta desta rodada" difere de "quanto já saiu no total".
  const hasMultipleRuns = steps.length > 1 || steps.some((step) => step.recurrenceIntervalHours);
  // Grupos DISTINTOS elegíveis — nunca `summary.pending` cru, que soma o
  // progresso de TODAS as etapas em paralelo (2026-09-14): com N
  // publicações, o mesmo grupo entra N vezes nesse total.
  const eligibleGroupCount = summary.total - summary.skipped;

  // Retomar-com-escolha (Task 9, 2026-09-15) — só oferece a escolha quando
  // alguma etapa ATIVA (sem `finishedAt`) já tem um `nextRunAt` no futuro;
  // sem isso, "esperar o horário marcado" não teria o que honrar.
  const now = Date.now();
  const hasFutureScheduledStep = steps.some(
    (step) => !step.finishedAt && step.nextRunAt && new Date(step.nextRunAt).getTime() > now,
  );

  // Lista de grupos por publicação (2026-09-18) — dado REAL de envio
  // (`stepTargets`), não a elegibilidade congelada de `targets`. Com uma
  // publicação só (o caso mais comum), fica igual a uma lista única de
  // sempre; com várias, o mesmo grupo aparece uma vez por publicação.
  const groupDisplayRows = flattenStepTargetsForDisplay(steps, stepTargets);
  const showPublicationColumn = steps.length > 1;

  const canEdit = broadcast.status === 'draft' || broadcast.status === 'paused';
  const editBlockedReason =
    broadcast.status === 'completed'
      ? 'Um disparo concluído não pode mais ser editado.'
      : broadcast.status === 'cancelled'
        ? 'Um disparo cancelado não pode mais ser editado.'
        : undefined;

  return (
    <div>
      <Link
        href={`/sessions/${encodeURIComponent(sessionName)}/campaigns`}
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Disparos
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
          {broadcast.name}
        </h1>
        <Badge variant={STATUS_BADGE_VARIANT[broadcast.status]}>
          {STATUS_LABELS[broadcast.status]}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={(!canEdit && broadcast.status !== 'running') || actionPending}
          title={editBlockedReason}
          onClick={() =>
            broadcast.status === 'running'
              ? setPauseAndEditConfirmOpen(true)
              : setEditDialogOpen(true)
          }
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {broadcast.status === 'running' ? 'Pausar e editar' : 'Editar'}
        </Button>
      </div>

      <Dialog open={pauseAndEditConfirmOpen} onOpenChange={setPauseAndEditConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar este disparo para editar?</DialogTitle>
            <DialogDescription>
              Editar exige pausar primeiro — o disparo vai parar de publicar até você retomá-lo de
              novo (o que já foi publicado não muda).
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
              onClick={async () => {
                setPauseAndEditConfirmOpen(false);
                setActionPending(true);
                try {
                  const result = await pauseGroupBroadcast(broadcastId);
                  setBroadcast(result.broadcast);
                  setEditDialogOpen(true);
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: 'Não foi possível pausar',
                    description: errorMessageFor(error),
                  });
                } finally {
                  setActionPending(false);
                }
              }}
            >
              Pausar e editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar disparo</DialogTitle>
          </DialogHeader>
          <GroupBroadcastCreateForm
            sessionName={sessionName}
            editing={{ broadcast, steps, targets }}
            onCreated={load}
            onClose={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <p className="mb-2 text-[13px] text-muted-foreground">
        Criado em {formatDateTime(broadcast.createdAt)}
        {broadcast.pausedReason === 'consecutive_failures' &&
          ' · pausado automaticamente: as duas últimas tentativas falharam (disjuntor de segurança)'}
      </p>
      {broadcast.sendWindowStart && broadcast.sendWindowEnd && (
        <p className="mb-2 text-[12.5px] text-muted-foreground">
          Só publica entre {broadcast.sendWindowStart} e {broadcast.sendWindowEnd} (vale para a
          campanha inteira, atravessando publicações).
        </p>
      )}

      {broadcast.stepLaunchOffsetMinutes ? (
        <p className="mb-2 text-[12.5px] text-muted-foreground">
          Publicações escalonadas: cada uma começa{' '}
          {broadcast.stepLaunchOffsetMinutes === 1 ? '1 minuto' : broadcast.stepLaunchOffsetMinutes + ' minutos'}{' '}
          depois da anterior, na primeira vez. Depois disso, cada uma repete no seu próprio ritmo.
        </p>
      ) : null}

      <div className="mb-4 max-w-2xl">
        <h2 className="mb-2 text-[14px] font-semibold text-foreground">
          Publicações desta campanha{' '}
          <span className="font-normal text-muted-foreground">
            ({steps.length} no total, rodando em paralelo)
          </span>
        </h2>
        <div className="space-y-2">
          {steps.map((step, index) => {
            // Etapas rodam em PARALELO (2026-09-14) — cada uma tem seu
            // próprio status, não existe mais "a etapa atual" da campanha.
            const isRunning = Boolean(step.startedAt) && !step.finishedAt;
            const isFinished = Boolean(step.finishedAt);
            const stepStatusLabel = isFinished
              ? 'Concluída'
              : isRunning
                ? 'Em execução'
                : 'Aguardando início';
            const stepStatusVariant = isFinished ? 'default' : isRunning ? 'success' : 'secondary';
            const stepLastSentAt = lastSentAtForStep(stepTargets[step.id]);
            return (
              <div
                key={step.id}
                className={`rounded-lg border p-3 ${
                  isRunning ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-foreground">
                    Publicação {index + 1} de {steps.length}
                  </span>
                  <Badge variant={stepStatusVariant}>{stepStatusLabel}</Badge>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-foreground">
                  {step.messageTemplate}
                </p>

                {step.recurrenceIntervalHours && (
                  <div className="mt-2 flex items-start gap-2 text-[12.5px] text-muted-foreground">
                    <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      {stepLastSentAt && (
                        <p>Última publicação em {formatDateTime(stepLastSentAt)}</p>
                      )}
                      <p>
                        Repete a cada{' '}
                        {step.recurrenceIntervalHours === 1
                          ? '1 hora'
                          : step.recurrenceIntervalHours + ' horas'}
                        {step.recurrenceMaxRuns
                          ? ' · ' + step.runsCompleted + ' de ' + step.recurrenceMaxRuns + ' repetições'
                          : ' · ' + step.runsCompleted + ' repetição(ões) já feita(s)'}
                      </p>
                      {isRunning && (
                        <p>
                          {/* Horário já passado com o disparo rodando = o ciclo
                              está saindo agora; mostrar a hora velha como
                              "próxima" confundia (achado real, 2026-09-17). */}
                          {step.nextRunAt && new Date(step.nextRunAt).getTime() > now
                            ? 'Próxima publicação em ' + formatDateTime(step.nextRunAt)
                            : 'Publicando agora nos grupos selecionados.'}
                          {step.recurrenceEndsAt &&
                            ' · termina em ' + formatDateTime(step.recurrenceEndsAt)}
                          {!step.recurrenceMaxRuns &&
                            !step.recurrenceEndsAt &&
                            ' · sem prazo para acabar'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {step.media && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {step.media.contentType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element -- proxy do BFF, não um asset estático local.
                        <img
                          src={groupBroadcastStepMediaUrl(broadcastId, step.id)}
                          alt="Anexo da publicação"
                          className="h-8 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="truncate text-[12.5px] text-foreground">
                        {step.media.fileName ?? step.media.contentType}
                      </span>
                    </div>
                    {broadcast.status === 'draft' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover anexo da publicação ${index + 1}`}
                        disabled={actionPending}
                        onClick={() => void handleRemoveStepMedia(step.id)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {broadcast.status !== 'draft' && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Disparo já iniciado — a lista de publicações é somente leitura.
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Dialog
          open={startDialogOpen}
          onOpenChange={(open) => {
            setStartDialogOpen(open);
            if (open) setResumeMode('now');
          }}
        >
          <Button
            type="button"
            size="cta"
            disabled={!canStart || actionPending}
            onClick={() => setStartDialogOpen(true)}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {broadcast.status === 'paused' ? 'Retomar envio' : 'Iniciar envio'}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {broadcast.status === 'paused' ? 'Retomar' : 'Iniciar'} publicação em{' '}
                {eligibleGroupCount} grupo{eligibleGroupCount === 1 ? '' : 's'}?
              </DialogTitle>
              <DialogDescription>
                Isto vai publicar mensagens de WhatsApp reais em até{' '}
                <strong>{eligibleGroupCount}</strong> grupo(s) elegível(is)
                {steps.length > 1 ? ', em cada uma das ' + steps.length + ' publicações' : ''}, com
                ritmo bem mais espaçado que um disparo individual — publicar em grupo é o padrão que
                o WhatsApp mais associa a spam, e o número pode ser banido em caso de abuso. Você
                poderá pausar a qualquer momento, mas mensagens já publicadas não podem ser desfeitas.
              </DialogDescription>
            </DialogHeader>

            {hasFutureScheduledStep && (
              <fieldset className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <legend className="px-1 text-[12.5px] font-medium text-foreground">
                  Alguma publicação já tem horário marcado
                </legend>
                <label className="flex items-center gap-2 text-[13px] text-foreground">
                  <input
                    type="radio"
                    name="resume-mode"
                    checked={resumeMode === 'now'}
                    onChange={() => setResumeMode('now')}
                    className="h-4 w-4"
                  />
                  Publicar agora
                </label>
                <label className="flex items-center gap-2 text-[13px] text-foreground">
                  <input
                    type="radio"
                    name="resume-mode"
                    checked={resumeMode === 'scheduled'}
                    onChange={() => setResumeMode('scheduled')}
                    className="h-4 w-4"
                  />
                  Esperar o horário marcado
                </label>
              </fieldset>
            )}

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
                    () => startGroupBroadcast(broadcastId, resumeMode),
                    broadcast.status === 'paused' ? 'Disparo retomado' : 'Disparo iniciado',
                  );
                }}
              >
                Confirmar e publicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          disabled={!canPause || actionPending}
          onClick={() => void runAction(() => pauseGroupBroadcast(broadcastId), 'Disparo pausado')}
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
            Cancelar disparo
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar este disparo?</DialogTitle>
              <DialogDescription>
                Ação definitiva — um disparo cancelado não pode ser retomado. Grupos ainda pendentes
                não receberão mensagem nenhuma.
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
                  void runAction(() => cancelGroupBroadcast(broadcastId), 'Disparo cancelado');
                }}
              >
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
        <span>
          <strong className="text-foreground">{summary.total}</strong> grupo(s) no total
        </span>
        <span>
          <strong className="text-foreground">{summary.sent}</strong>{' '}
          {hasMultipleRuns ? 'publicado(s) nesta rodada' : 'publicado(s)'}
        </span>
        {hasMultipleRuns && (
          <span>
            <strong className="text-foreground">{summary.totalSent}</strong> publicação(ões) no
            total (todas as etapas/repetições)
          </span>
        )}
        <span>
          <strong className="text-foreground">{summary.pending}</strong> pendente(s)
        </span>
        {summary.failed > 0 && (
          <span className="text-destructive">
            <strong>{summary.failed}</strong> falharam
          </span>
        )}
        {summary.skipped > 0 && (
          <span>
            <strong className="text-foreground">{summary.skipped}</strong> suprimido(s)
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card" data-testid="group-broadcast-targets-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Grupo</TableHead>
              {showPublicationColumn && <TableHead className="px-4">Publicação</TableHead>}
              <TableHead className="px-4">Status</TableHead>
              <TableHead className={cn(COLUMN_FROM_SM, 'px-4')}>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupDisplayRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="px-4 py-3 align-top">
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 break-words text-[13px] text-foreground">
                      {row.target.groupName}
                    </span>
                  </div>
                  {/* Celular: a coluna Detalhe some e o texto desce para baixo do grupo. */}
                  {targetDetail(row.target) && (
                    <p className="mt-1 break-words text-[12px] text-muted-foreground sm:hidden">
                      {targetDetail(row.target)}
                    </p>
                  )}
                </TableCell>
                {showPublicationColumn && (
                  <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[12.5px] text-muted-foreground">
                    {row.stepNumber} de {steps.length}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                  <Badge variant={TARGET_STATUS_BADGE_VARIANT[row.target.status]}>
                    {TARGET_STATUS_LABELS[row.target.status]}
                  </Badge>
                </TableCell>
                <TableCell className={cn(COLUMN_FROM_SM, 'px-4 py-3 align-top text-[12.5px] text-muted-foreground')}>
                  {targetDetail(row.target)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
