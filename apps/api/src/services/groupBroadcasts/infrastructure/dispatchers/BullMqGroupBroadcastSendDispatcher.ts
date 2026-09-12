import { Queue } from 'bullmq';

import { GroupBroadcastSendDispatcher } from '../../domain/dispatchers/GroupBroadcastSendDispatcher';
import {
  GROUP_BROADCAST_SEND_JOB_NAME,
  GroupBroadcastSendJobData,
} from '../queues/GroupBroadcastSendQueue';

/**
 * Produtor real da fila `group-broadcast-send` — Disparos em grupos
 * (2026-09-11). Carrega as DUAS lições já pagas pelo motor de campanhas:
 *
 * 1. **`jobId` sem `:`.** O BullMQ recusa `jobId` com `:` a menos que tenha
 *    exatamente 3 partes (`Custom Id cannot contain :`), e a exceção derrubou
 *    em silêncio o 2º parágrafo de toda resposta da IA por semanas (ver
 *    CLAUDE.md §18, "balão único"). `jobId = targetId` (UUID puro, só `-`) —
 *    e a checagem abaixo nomeia o culpado se isso um dia mudar.
 * 2. **Remover antes de adicionar.** Um job já concluído/falho com o mesmo
 *    `jobId` faz o `add()` seguinte ser ignorado sem erro — retomar um
 *    disparo pausado não reagendaria nada (bug real de 2026-08-18 em
 *    `BullMqCampaignSendDispatcher`). `queue.remove` é idempotente.
 */
export class BullMqGroupBroadcastSendDispatcher implements GroupBroadcastSendDispatcher {
  constructor(private readonly queue: Queue<GroupBroadcastSendJobData>) {}

  async scheduleTarget(
    tenantId: string,
    broadcastId: string,
    targetId: string,
    delayMs: number,
  ): Promise<void> {
    if (targetId.includes(':')) {
      throw new Error(
        `jobId inválido para o BullMQ ("${targetId}"): não pode conter ':' — use o id do alvo (UUID).`,
      );
    }
    await this.queue.remove(targetId);
    await this.queue.add(
      GROUP_BROADCAST_SEND_JOB_NAME,
      { tenantId, broadcastId, targetId },
      { jobId: targetId, delay: delayMs },
    );
  }
}
