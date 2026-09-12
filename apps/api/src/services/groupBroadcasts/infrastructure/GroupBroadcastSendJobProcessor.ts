import { Logger } from '../../../shared/domain/Logger';
import { GroupBroadcastRepository } from '../domain/repositories/GroupBroadcastRepository';
import { GroupMessageSender } from '../domain/providers/GroupMessageSender';
import {
  GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE,
  shouldPauseGroupBroadcast,
} from '../domain/policies/groupBroadcastPacing';
import {
  buildSendWindow,
  decideNextRun,
  isRecurring,
} from '../domain/policies/groupBroadcastRecurrence';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import { GroupBroadcastSendJobData } from './queues/GroupBroadcastSendQueue';

/**
 * Consome `group-broadcast-send` e publica a mensagem em UM grupo — Disparos
 * em grupos (2026-09-11). Instanciado só dentro de `apps/api` (ADR #54).
 *
 * Mesma ordem de `CampaignSendJobProcessor`, sem teto diário (o teto aqui é
 * por disparo, `MAX_GROUPS_PER_BROADCAST`, aplicado na criação):
 *
 * 1. Relê o disparo — só segue se `running` (pausar/cancelar nunca tocam a
 *    fila; o job dispara, olha o status e termina sem enviar).
 * 2. Relê o alvo — só segue se `pending` (um job repetido nunca reenvia).
 * 3. Busca o binário da mídia, se houver.
 * 4. Publica via `GroupMessageSender` (nunca lança; devolve ok/motivo).
 * 5. Grava `sent`/`failed` + `attemptedAt`.
 * 6. Disjuntor: as DUAS últimas tentativas falharam → pausa
 *    (`pausedReason: 'consecutive_failures'`).
 * 7. Sem pendentes → `completed`.
 */
export class GroupBroadcastSendJobProcessor {
  constructor(
    private readonly repository: GroupBroadcastRepository,
    private readonly sender: GroupMessageSender,
    private readonly logger: Logger,
    /**
     * Recorrência (2026-09-11): usado só no fim de uma repetição, para agendar
     * a próxima. OPCIONAL — sem ele, um disparo recorrente simplesmente
     * encerra ao fim do primeiro ciclo, em vez de quebrar.
     */
    private readonly sendDispatcher?: GroupBroadcastSendDispatcher,
  ) {}

  async process(data: GroupBroadcastSendJobData): Promise<void> {
    const broadcast = await this.repository.findById(data.tenantId, data.broadcastId);
    if (!broadcast || broadcast.status !== 'running') {
      this.logger.info('Job group-broadcast-send descartado: disparo não está em execução', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        status: broadcast?.status,
      });
      return;
    }

    const target = await this.repository.findTargetById(data.tenantId, data.targetId);
    if (!target || target.broadcastId !== broadcast.id || target.status !== 'pending') {
      this.logger.info('Job group-broadcast-send descartado: grupo já processado', {
        tenantId: data.tenantId,
        targetId: data.targetId,
        status: target?.status,
      });
      return;
    }

    const media = broadcast.media
      ? await this.repository.getMediaContent(data.tenantId, data.broadcastId)
      : undefined;

    const result = await this.sender.send(
      data.tenantId,
      broadcast.sessionName,
      target.groupJid,
      broadcast.messageTemplate,
      media,
    );
    const attemptedAt = new Date();

    if (result.ok) {
      await this.repository.markTargetSent(data.tenantId, target.id, attemptedAt);
    } else {
      const reason = result.failureReason ?? 'erro_desconhecido';
      await this.repository.markTargetFailed(data.tenantId, target.id, attemptedAt, reason);
      this.logger.warn('Falha ao publicar em grupo', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        targetId: target.id,
        reason,
      });
    }

    const recentOutcomes = await this.repository.listRecentOutcomes(
      data.tenantId,
      data.broadcastId,
      GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE,
    );
    if (shouldPauseGroupBroadcast(recentOutcomes)) {
      await this.repository.updateStatus(
        data.tenantId,
        data.broadcastId,
        'paused',
        'consecutive_failures',
      );
      this.logger.error(
        'Disparo em grupos pausado automaticamente: falhas seguidas (disjuntor de segurança)',
        { tenantId: data.tenantId, broadcastId: data.broadcastId, recentOutcomes },
      );
      return;
    }

    const remaining = await this.repository.countPending(data.tenantId, data.broadcastId);
    if (remaining > 0) return;

    // Fim de UMA repetição. Sem recorrência, isso é o fim do disparo (é o
    // comportamento original). Com recorrência, quem decide é o Domain
    // (`decideNextRun`): as três formas de término do fundador — teto de
    // repetições, data/hora limite e "até eu cancelar" — convivem, e vale a que
    // vier primeiro.
    // Releitura: o `broadcast` do topo do método foi lido ANTES do envio, e
    // `runsCompleted`/status podem ter mudado nesse meio-tempo.
    const current = await this.repository.findById(data.tenantId, data.broadcastId);
    const finishedAt = new Date();

    if (!current || !isRecurring(current) || !this.sendDispatcher) {
      await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
      this.logger.info('Disparo em grupos concluído', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
      });
      return;
    }

    const window = buildSendWindow(current.sendWindowStart, current.sendWindowEnd);
    const decision = decideNextRun(current, window, finishedAt);
    const runsCompleted = current.runsCompleted + 1;

    if (!decision.shouldRepeat) {
      await this.repository.markRunFinished(
        data.tenantId,
        data.broadcastId,
        runsCompleted,
        null,
      );
      await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
      this.logger.info('Disparo em grupos recorrente encerrado', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        runsCompleted,
        reason: decision.reason,
      });
      return;
    }

    await this.repository.markRunFinished(
      data.tenantId,
      data.broadcastId,
      runsCompleted,
      decision.nextRunAt,
    );
    await this.sendDispatcher.scheduleRun(
      data.tenantId,
      data.broadcastId,
      runsCompleted + 1,
      Math.max(0, decision.nextRunAt.getTime() - finishedAt.getTime()),
    );
    this.logger.info('Repetição concluída; próxima agendada', {
      tenantId: data.tenantId,
      broadcastId: data.broadcastId,
      runsCompleted,
      nextRunAt: decision.nextRunAt,
    });
  }
}
