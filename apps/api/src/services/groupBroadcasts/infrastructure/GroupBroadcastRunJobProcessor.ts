import { Logger } from '../../../shared/domain/Logger';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import { GroupBroadcastRepository } from '../domain/repositories/GroupBroadcastRepository';
import { computeGroupSendDelayMs } from '../domain/policies/groupBroadcastPacing';
import {
  buildSendWindow,
  isWithinSendWindow,
  shiftIntoSendWindow,
} from '../domain/policies/groupBroadcastRecurrence';
import { GroupBroadcastRunJobData } from './queues/GroupBroadcastSendQueue';

export type GroupBroadcastRunOutcome =
  | 'started'
  | 'skipped'
  | 'postponed'
  | 'completed_without_targets';

/**
 * Inicia uma REPETIÇÃO de um disparo recorrente (2026-09-11).
 *
 * Quem agenda este job é o processador de envio, quando a repetição anterior
 * termina — ver `GroupBroadcastSendJobProcessor`. Aqui só se reabre o disparo:
 *
 * 1. relê o disparo; segue apenas se ainda estiver `running` — pausar ou
 *    cancelar não precisa mexer na fila, o job dispara, vê o status e encerra
 *    (mesmo padrão de `shouldAutoRespond` ser re-checado no processamento);
 * 2. fora da janela de horário, o ciclo é REAGENDADO para o próximo horário
 *    permitido em vez de publicar de madrugada — nunca descartado;
 * 3. devolve os alvos a `pending` (`skipped` continua fora) e agenda os envios
 *    com o mesmo ritmo do primeiro disparo.
 */
export class GroupBroadcastRunJobProcessor {
  constructor(
    private readonly repository: GroupBroadcastRepository,
    private readonly sendDispatcher: GroupBroadcastSendDispatcher,
    private readonly logger: Logger,
  ) {}

  async process(data: GroupBroadcastRunJobData): Promise<GroupBroadcastRunOutcome> {
    const { tenantId, broadcastId, runNumber } = data;

    const broadcast = await this.repository.findById(tenantId, broadcastId);
    if (!broadcast || broadcast.status !== 'running') {
      this.logger.info('Repetição de disparo em grupos ignorada: disparo não está em execução', {
        tenantId,
        broadcastId,
        runNumber,
        status: broadcast?.status,
      });
      return 'skipped';
    }

    const now = new Date();
    const window = buildSendWindow(broadcast.sendWindowStart, broadcast.sendWindowEnd);
    if (!isWithinSendWindow(now, window)) {
      const postponedTo = shiftIntoSendWindow(now, window);
      await this.repository.markRunFinished(
        tenantId,
        broadcastId,
        broadcast.runsCompleted,
        postponedTo,
      );
      await this.sendDispatcher.scheduleRun(
        tenantId,
        broadcastId,
        runNumber,
        Math.max(0, postponedTo.getTime() - now.getTime()),
      );
      this.logger.info('Repetição adiada para dentro da janela de horário', {
        tenantId,
        broadcastId,
        runNumber,
        postponedTo,
      });
      return 'postponed';
    }

    const reopened = await this.repository.resetTargetsForNextRun(tenantId, broadcastId);
    const pendingTargets = await this.repository.listPendingTargets(tenantId, broadcastId);
    if (pendingTargets.length === 0) {
      // Todos os grupos viraram `skipped` (saímos deles, ou viraram só-admin):
      // não há o que repetir, e repetir "nada" para sempre seria pior que
      // encerrar.
      await this.repository.markRunFinished(tenantId, broadcastId, broadcast.runsCompleted, null);
      await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      this.logger.warn('Recorrência encerrada: nenhum grupo elegível restou', {
        tenantId,
        broadcastId,
        runNumber,
      });
      return 'completed_without_targets';
    }

    for (const [index, target] of pendingTargets.entries()) {
      // Sequencial pelo mesmo motivo de `startBroadcast`: no máximo 30 alvos, e
      // uma falha de Redis no meio deixa o estado simples de raciocinar.
      // eslint-disable-next-line no-await-in-loop
      await this.sendDispatcher.scheduleTarget(
        tenantId,
        broadcastId,
        target.id,
        computeGroupSendDelayMs(index, broadcast.intervalSeconds, now),
      );
    }

    await this.repository.markRunFinished(tenantId, broadcastId, broadcast.runsCompleted, null);
    this.logger.info('Repetição de disparo em grupos iniciada', {
      tenantId,
      broadcastId,
      runNumber,
      reopened,
      scheduled: pendingTargets.length,
    });
    return 'started';
  }
}
