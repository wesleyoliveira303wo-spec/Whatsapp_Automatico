import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Plus,
  Play,
  Pause,
  MoreVertical,
  XCircle,
  Trash2,
} from 'lucide-react';

import {
  fetchGroupBroadcasts,
  startGroupBroadcast,
  pauseGroupBroadcast,
  cancelGroupBroadcast,
  deleteGroupBroadcast,
  ClientApiError,
  type GroupBroadcast,
  type GroupBroadcastStatus,
  type GroupBroadcastSummary,
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
import ErrorState from '@/components/states/ErrorState';
import GroupBroadcastCreateForm from '@/components/GroupBroadcastCreateForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface GroupBroadcastsPanelProps {
  sessionName: string;
}

const STATUS_LABELS: Record<GroupBroadcastStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  running: 'Em andamento',
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

/** `start` recebe a descrição MONTADA em runtime (nomeia quantos grupos + o risco) — ver `buildStartConfirmDescription`. */
const CONFIRM_ACTION_COPY: Record<
  'cancel' | 'delete',
  { title: string; description: string; confirmLabel: string; variant: 'default' | 'destructive' }
> = {
  cancel: {
    title: 'Cancelar este disparo?',
    description:
      'Ação definitiva — um disparo cancelado não pode ser retomado. Grupos ainda pendentes não receberão mensagem nenhuma.',
    confirmLabel: 'Confirmar cancelamento',
    variant: 'destructive',
  },
  delete: {
    title: 'Excluir este disparo?',
    description:
      'Ação definitiva e irreversível — o disparo e todos os seus alvos serão apagados permanentemente. Mensagens já publicadas continuam entregues, mas o histórico deste disparo some.',
    confirmLabel: 'Excluir',
    variant: 'destructive',
  },
};

interface BroadcastRow {
  broadcast: GroupBroadcast;
  summary: GroupBroadcastSummary;
}

/**
 * Confirmação de "Iniciar"/"Retomar" — explícita sobre QUANTOS grupos e o
 * RISCO (padrão que o WhatsApp mais associa a spam), diferente das outras
 * duas confirmações (texto fixo em `CONFIRM_ACTION_COPY`).
 */
function buildStartConfirmCopy(
  broadcast: GroupBroadcast,
  pendingCount: number,
): { title: string; description: string; confirmLabel: string } {
  const verb = broadcast.status === 'paused' ? 'Retomar' : 'Iniciar';
  return {
    title: `${verb} publicação em ${pendingCount} grupo${pendingCount === 1 ? '' : 's'}?`,
    description: `Isto vai publicar mensagens de WhatsApp reais em ${pendingCount} grupo${pendingCount === 1 ? '' : 's'} pendente${pendingCount === 1 ? '' : 's'}, com ritmo bem mais espaçado que um disparo individual — publicar em grupo é o padrão que o WhatsApp mais associa a spam, e o número pode ser banido em caso de abuso. Você poderá pausar a qualquer momento, mas mensagens já publicadas não podem ser desfeitas.`,
    confirmLabel: `${verb === 'Retomar' ? 'Confirmar e retomar' : 'Confirmar e publicar'}`,
  };
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
 * Lista de disparos em grupos de uma sessão (2026-09-11) — segunda função de
 * Campanhas (aba "Grupos"): publicação de uma mensagem em grupos de WhatsApp
 * dos quais o número da sessão participa, em vez de contatos individuais.
 *
 * Mais simples que `CampaignsPanel` de propósito — sem indicadores agregados
 * nem gráfico, o volume esperado é bem menor (ação deliberada de
 * administrador, teto de 30 grupos por disparo).
 */
export default function GroupBroadcastsPanel({
  sessionName,
}: GroupBroadcastsPanelProps): JSX.Element {
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'start'; broadcast: GroupBroadcast; pendingCount: number }
    | { type: 'cancel' | 'delete'; broadcast: GroupBroadcast }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    fetchGroupBroadcasts(sessionName)
      .then((page) => setRows(page.broadcasts))
      .catch(() => setErrorMessage('Não foi possível carregar os disparos em grupos.'))
      .finally(() => setLoading(false));
  }, [sessionName]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(
    broadcast: GroupBroadcast,
    action: () => Promise<{ broadcast: GroupBroadcast }>,
    successMessage: string,
  ): Promise<void> {
    setActionPendingId(broadcast.id);
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
    const { type, broadcast } = confirmAction;
    setConfirmAction(null);
    if (type === 'start') {
      await runAction(
        broadcast,
        () => startGroupBroadcast(broadcast.id),
        broadcast.status === 'paused' ? 'Disparo retomado' : 'Disparo iniciado',
      );
    } else if (type === 'cancel') {
      await runAction(broadcast, () => cancelGroupBroadcast(broadcast.id), 'Disparo cancelado');
    } else {
      setDeleting(true);
      try {
        await deleteGroupBroadcast(broadcast.id);
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
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <p className="text-[13px] text-muted-foreground">
          Publique uma mensagem em grupos de WhatsApp dos quais este número participa.
        </p>
        <Button type="button" size="cta" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Novo disparo em grupos
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : errorMessage ? (
        <ErrorState description={errorMessage} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum disparo em grupos ainda"
          description="Crie o primeiro disparo desta sessão — escolha os grupos, escreva a mensagem e revise antes de publicar."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Novo disparo em grupos
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card" data-testid="group-broadcasts-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Disparo</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Grupos</TableHead>
                <TableHead className="px-4">Publicados</TableHead>
                <TableHead className="px-4">Criado em</TableHead>
                <TableHead className="px-4 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ broadcast, summary }) => {
                const canStart = broadcast.status === 'draft' || broadcast.status === 'paused';
                const canPause = broadcast.status === 'running';
                const canCancel =
                  broadcast.status === 'draft' ||
                  broadcast.status === 'running' ||
                  broadcast.status === 'paused';

                return (
                  <TableRow key={broadcast.id}>
                    <TableCell className="max-w-0 px-4 py-3 align-top">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Users className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {broadcast.name}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                      <Badge variant={STATUS_BADGE_VARIANT[broadcast.status]}>
                        {STATUS_LABELS[broadcast.status]}
                      </Badge>
                    </TableCell>

                    <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[13px] text-foreground">
                      {summary.total}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[13px] text-foreground">
                      {summary.sent}
                      {summary.failed > 0 && (
                        <span className="ml-1 text-[12px] text-destructive">
                          ({summary.failed} falha{summary.failed === 1 ? '' : 's'})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3 align-top text-[12.5px] text-muted-foreground">
                      {formatDateTime(broadcast.createdAt)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap px-4 py-3 align-top">
                      <div className="flex shrink-0 items-center justify-end gap-1">
                        {canPause ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={actionPendingId === broadcast.id}
                            onClick={() =>
                              void runAction(
                                broadcast,
                                () => pauseGroupBroadcast(broadcast.id),
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
                            disabled={actionPendingId === broadcast.id}
                            onClick={() =>
                              setConfirmAction({
                                type: 'start',
                                broadcast,
                                pendingCount: summary.pending,
                              })
                            }
                          >
                            <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {broadcast.status === 'paused' ? 'Retomar' : 'Iniciar'}
                          </Button>
                        ) : null}

                        {/* `modal={false}`: mesmo motivo de `CampaignsPanel` — três itens
                            deste menu abrem um `Dialog` de confirmação, e um menu MODAL +
                            um Dialog no mesmo tique travam o processo (achado real). */}
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
                                href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/groups/${encodeURIComponent(broadcast.id)}`}
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
                                  onClick={() => setConfirmAction({ type: 'cancel', broadcast })}
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Cancelar disparo
                                </button>
                              </DropdownMenuItem>
                            )}
                            {broadcast.status !== 'running' && (
                              <DropdownMenuItem asChild>
                                <button
                                  type="button"
                                  className="gap-2 text-destructive focus:bg-destructive/10"
                                  onClick={() => setConfirmAction({ type: 'delete', broadcast })}
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
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo disparo em grupos</DialogTitle>
          </DialogHeader>
          <GroupBroadcastCreateForm
            sessionName={sessionName}
            onCreated={load}
            onClose={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          {confirmAction?.type === 'start' ? (
            (() => {
              const startCopy = buildStartConfirmCopy(
                confirmAction.broadcast,
                confirmAction.pendingCount,
              );
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{startCopy.title}</DialogTitle>
                    <DialogDescription>{startCopy.description}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Voltar
                      </Button>
                    </DialogClose>
                    <Button type="button" onClick={() => void handleConfirmedAction()}>
                      {startCopy.confirmLabel}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()
          ) : confirmAction ? (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_ACTION_COPY[confirmAction.type].title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_ACTION_COPY[confirmAction.type].description}
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
                  variant={CONFIRM_ACTION_COPY[confirmAction.type].variant}
                  disabled={deleting}
                  onClick={() => void handleConfirmedAction()}
                  className={cn(deleting && 'opacity-70')}
                >
                  {confirmAction.type === 'delete' && deleting
                    ? 'Excluindo…'
                    : CONFIRM_ACTION_COPY[confirmAction.type].confirmLabel}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
