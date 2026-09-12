import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Play, Pause, XCircle, FileText, X, Users } from 'lucide-react';

import {
  fetchGroupBroadcast,
  startGroupBroadcast,
  pauseGroupBroadcast,
  cancelGroupBroadcast,
  removeGroupBroadcastMedia,
  groupBroadcastMediaUrl,
  ClientApiError,
  type GroupBroadcast,
  type GroupBroadcastStatus,
  type GroupBroadcastTarget,
  type GroupBroadcastSummary,
} from '@/lib/clientApi';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatDateTime } from '@/lib/formatters';
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

const TARGET_STATUS_LABELS: Record<GroupBroadcastTarget['status'], string> = {
  pending: 'Aguardando envio',
  sent: 'Publicado',
  failed: 'Falhou',
  skipped: 'Suprimido',
};

const TARGET_STATUS_BADGE_VARIANT: Record<
  GroupBroadcastTarget['status'],
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
  const [summary, setSummary] = useState<GroupBroadcastSummary | null>(null);
  const [targets, setTargets] = useState<GroupBroadcastTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

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
          setSummary(detail.summary);
          setTargets(detail.targets);
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

  async function handleRemoveMedia(): Promise<void> {
    setActionPending(true);
    try {
      const result = await removeGroupBroadcastMedia(broadcastId);
      setBroadcast(result.broadcast);
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
          {broadcast.name}
        </h1>
        <Badge variant={STATUS_BADGE_VARIANT[broadcast.status]}>
          {STATUS_LABELS[broadcast.status]}
        </Badge>
      </div>
      <p className="mb-2 text-[13px] text-muted-foreground">
        Criado em {formatDateTime(broadcast.createdAt)}
        {broadcast.pausedReason === 'consecutive_failures' &&
          ' · pausado automaticamente: as duas últimas tentativas falharam (disjuntor de segurança)'}
      </p>
      <p className="mb-2 max-w-2xl whitespace-pre-wrap rounded-lg border border-dashed border-border bg-card p-3 text-[13px] text-foreground">
        {broadcast.messageTemplate}
      </p>

      {broadcast.media && (
        <div className="mb-4 flex max-w-2xl items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {broadcast.media.contentType === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- proxy do BFF, não um asset estático local.
              <img
                src={groupBroadcastMediaUrl(broadcastId)}
                alt="Anexo do disparo"
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">
                {broadcast.media.fileName ?? broadcast.media.contentType}
              </p>
              <p className="text-[12px] text-muted-foreground">{broadcast.media.contentType}</p>
            </div>
          </div>
          {broadcast.status === 'draft' && (
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
            {broadcast.status === 'paused' ? 'Retomar envio' : 'Iniciar envio'}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {broadcast.status === 'paused' ? 'Retomar' : 'Iniciar'} publicação em{' '}
                {summary.pending} grupo{summary.pending === 1 ? '' : 's'}?
              </DialogTitle>
              <DialogDescription>
                Isto vai publicar mensagens de WhatsApp reais em até{' '}
                <strong>{summary.pending}</strong> grupo(s) pendente(s), com ritmo bem mais espaçado
                que um disparo individual — publicar em grupo é o padrão que o WhatsApp mais associa
                a spam, e o número pode ser banido em caso de abuso. Você poderá pausar a qualquer
                momento, mas mensagens já publicadas não podem ser desfeitas.
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
                    () => startGroupBroadcast(broadcastId),
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
          <strong className="text-foreground">{summary.sent}</strong> publicado(s)
        </span>
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
              <TableHead className="px-4">Status</TableHead>
              <TableHead className="px-4">Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((target) => (
              <TableRow key={target.id}>
                <TableCell className="px-4 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-[13px] text-foreground">{target.groupName}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                  <Badge variant={TARGET_STATUS_BADGE_VARIANT[target.status]}>
                    {TARGET_STATUS_LABELS[target.status]}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 align-top text-[12.5px] text-muted-foreground">
                  {target.status === 'skipped' &&
                    target.skipReason &&
                    (SKIP_REASON_LABELS[target.skipReason] ?? target.skipReason)}
                  {target.status === 'failed' && target.errorMessage}
                  {target.status === 'sent' && target.sentAt && formatDateTime(target.sentAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
