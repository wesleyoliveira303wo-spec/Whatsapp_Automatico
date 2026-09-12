import { Logger } from '../../../shared/domain/Logger';
import { GroupBroadcastRepository } from '../domain/repositories/GroupBroadcastRepository';
import { GroupMessageSender } from '../domain/providers/GroupMessageSender';
import {
  GROUP_CIRCUIT_BREAKER_SAMPLE_SIZE,
  shouldPauseGroupBroadcast,
} from '../domain/policies/groupBroadcastPacing';
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
    if (remaining === 0) {
      await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
      this.logger.info('Disparo em grupos concluído', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
      });
    }
  }
}
