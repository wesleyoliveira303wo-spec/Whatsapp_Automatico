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
  DEFAULT_GROUP_BROADCAST_TIMEZONE,
  isRecurring,
} from '../domain/policies/groupBroadcastRecurrence';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import { GroupBroadcastSendJobData } from './queues/GroupBroadcastSendQueue';

/**
 * Consome `group-broadcast-send` e publica a mensagem em UM grupo, para UMA
 * ETAPA — Disparos em grupos (2026-09-11), estendido em 2026-09-14 para
 * "cadência entre publicações": as etapas rodam em PARALELO, cada uma com seu
 * próprio ciclo/recorrência, independente das demais (ver
 * `docs/superpowers/specs/2026-09-14-group-broadcast-etapas-design.md`).
 * Instanciado só dentro de `apps/api` (ADR #54).
 *
 * Mesma ordem de `CampaignSendJobProcessor`, sem teto diário (o teto aqui é
 * por disparo, `MAX_GROUPS_PER_BROADCAST`, aplicado na criação):
 *
 * 1. Relê o disparo — só segue se `running` (pausar/cancelar nunca tocam a
 *    fila; o job dispara, olha o status e termina sem enviar).
 * 2. Relê o `GroupBroadcastStepTarget` — só segue se `pending` (idempotência).
 * 3. Lê a ETAPA (por `stepId`) — mensagem/mídia vêm dela.
 * 4. Publica via `GroupMessageSender` (nunca lança; devolve ok/motivo).
 * 5. Grava `sent`/`failed` + `attemptedAt` NO PROGRESSO DESTA ETAPA.
 * 6. Disjuntor: as DUAS últimas tentativas falharam → pausa a CAMPANHA
 *    inteira (`pausedReason: 'consecutive_failures'`) — o histórico observado
 *    ATRAVESSA etapas (todas competem pelo mesmo número).
 * 7. Sem pendentes NESTA ETAPA → fim de UM ciclo dela. Dois desfechos: a
 *    etapa ainda repete (`decideNextRun.shouldRepeat`) → agenda o próximo
 *    ciclo DELA MESMA; ou encerrou de vez (sem recorrência, ou recorrência
 *    esgotada) → marca `finishedAt`. Em QUALQUER dos dois casos, se TODAS as
 *    etapas da campanha já tiverem `finishedAt`, a campanha vira `completed`.
 */
export class GroupBroadcastSendJobProcessor {
  constructor(
    private readonly repository: GroupBroadcastRepository,
    private readonly sender: GroupMessageSender,
    private readonly logger: Logger,
    /**
     * Recorrência (2026-09-11/2026-09-14): usado só no fim de um ciclo, para
     * agendar o próximo. OPCIONAL — sem ele, uma etapa simplesmente encerra
     * ao fim do ciclo atual, em vez de quebrar.
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

    const stepTarget = await this.repository.findStepTargetById(data.tenantId, data.stepTargetId);
    if (
      !stepTarget ||
      stepTarget.broadcastId !== broadcast.id ||
      stepTarget.stepId !== data.stepId ||
      stepTarget.status !== 'pending'
    ) {
      this.logger.info('Job group-broadcast-send descartado: grupo já processado', {
        tenantId: data.tenantId,
        stepTargetId: data.stepTargetId,
        status: stepTarget?.status,
      });
      return;
    }

    const step = await this.repository.findStepById(data.tenantId, data.stepId);
    if (!step || step.broadcastId !== broadcast.id) {
      this.logger.error('Job group-broadcast-send sem etapa correspondente — ignorando', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        stepId: data.stepId,
      });
      return;
    }

    const media = step.media
      ? await this.repository.getStepMediaContent(data.tenantId, step.id)
      : undefined;

    const result = await this.sender.send(
      data.tenantId,
      broadcast.sessionName,
      stepTarget.groupJid,
      step.messageTemplate,
      media,
    );
    const attemptedAt = new Date();

    if (result.ok) {
      await this.repository.markStepTargetSent(data.tenantId, stepTarget.id, attemptedAt);
    } else {
      const reason = result.failureReason ?? 'erro_desconhecido';
      await this.repository.markStepTargetFailed(data.tenantId, stepTarget.id, attemptedAt, reason);
      this.logger.warn('Falha ao publicar em grupo', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
        stepId: data.stepId,
        stepTargetId: stepTarget.id,
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

    const remaining = await this.repository.countPendingStepTargets(data.tenantId, data.stepId);
    if (remaining > 0) return;

    // Fim de UM CICLO desta etapa. Releitura: a etapa do topo do método foi
    // lida ANTES do envio, e `runsCompleted` pode ter mudado nesse meio-tempo.
    const freshStep = await this.repository.findStepById(data.tenantId, data.stepId);
    if (!freshStep) return; // corrida rara: etapa apagada entre o topo do método e aqui.

    const finishedAt = new Date();
    const runsCompleted = freshStep.runsCompleted + 1;

    if (isRecurring(freshStep) && this.sendDispatcher) {
      const window = buildSendWindow(broadcast.sendWindowStart, broadcast.sendWindowEnd);
      const decision = decideNextRun(freshStep, window, finishedAt, DEFAULT_GROUP_BROADCAST_TIMEZONE);
      if (decision.shouldRepeat) {
        await this.repository.markStepRunFinished(
          data.tenantId,
          freshStep.id,
          runsCompleted,
          decision.nextRunAt,
        );
        await this.sendDispatcher.scheduleRun(
          data.tenantId,
          data.broadcastId,
          freshStep.id,
          runsCompleted + 1,
          Math.max(0, decision.nextRunAt.getTime() - finishedAt.getTime()),
        );
        this.logger.info('Repetição desta etapa concluída; próxima agendada', {
          tenantId: data.tenantId,
          broadcastId: data.broadcastId,
          stepId: freshStep.id,
          runsCompleted,
          nextRunAt: decision.nextRunAt,
        });
        return;
      }
    }

    // A etapa terminou de vez (sem recorrência, ou recorrência esgotada) —
    // nunca mais dispara sozinha; as demais etapas seguem seu próprio ciclo.
    await this.repository.markStepFinished(data.tenantId, freshStep.id, runsCompleted);
    this.logger.info('Etapa do disparo em grupos concluída', {
      tenantId: data.tenantId,
      broadcastId: data.broadcastId,
      stepId: freshStep.id,
      runsCompleted,
    });

    if (await this.repository.areAllStepsFinished(data.tenantId, data.broadcastId)) {
      await this.repository.updateStatus(data.tenantId, data.broadcastId, 'completed');
      this.logger.info('Disparo em grupos concluído (todas as etapas encerradas)', {
        tenantId: data.tenantId,
        broadcastId: data.broadcastId,
      });
    }
  }
}
