import { Queue } from 'bullmq';

import { CampaignSendDispatcher } from '../../domain/dispatchers/CampaignSendDispatcher';
import {
  CAMPAIGN_SEND_JOB_NAME,
  CampaignSendJobData,
} from '../queues/CampaignSendQueue';

/**
 * Implementação real (produtor) de `CampaignSendDispatcher` sobre a fila
 * BullMQ `campaign-send` — Fase L, Bloco L4.
 *
 * `jobId = recipientId` (camada 2 de idempotência, §9.4): o BullMQ recusa
 * um segundo job para o MESMO destinatário enquanto o primeiro ainda não
 * tiver sido concluído/removido — mesmo padrão de `aiInteractionId` em
 * `BullMqOutboundMessageDispatcher`.
 */
export class BullMqCampaignSendDispatcher implements CampaignSendDispatcher {
  constructor(private readonly queue: Queue<CampaignSendJobData>) {}

  async scheduleRecipient(
    tenantId: string,
    campaignId: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void> {
    await this.queue.add(
      CAMPAIGN_SEND_JOB_NAME,
      { tenantId, campaignId, recipientId },
      { jobId: recipientId, delay: delayMs },
    );
  }
}
