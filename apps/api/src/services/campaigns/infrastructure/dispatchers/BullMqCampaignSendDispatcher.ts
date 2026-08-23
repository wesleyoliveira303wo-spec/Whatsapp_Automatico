import { Queue } from 'bullmq';

import { CampaignSendDispatcher } from '../../domain/dispatchers/CampaignSendDispatcher';
import { CAMPAIGN_SEND_JOB_NAME, CampaignSendJobData } from '../queues/CampaignSendQueue';

/**
 * Implementação real (produtor) de `CampaignSendDispatcher` sobre a fila
 * BullMQ `campaign-send` — Fase L, Bloco L4.
 *
 * `jobId = recipientId` (camada 2 de idempotência, §9.4): o BullMQ recusa
 * um segundo job para o MESMO destinatário enquanto o primeiro ainda não
 * tiver sido concluído/removido — mesmo padrão de `aiInteractionId` em
 * `BullMqOutboundMessageDispatcher`.
 *
 * CORREÇÃO 2026-08-18 (bug real: pausar/retomar — ou reabrir — uma campanha
 * nunca reagendava destinatários já processados uma vez). A docstring do
 * port já dizia que `removeOnComplete: true` no Worker liberaria o `jobId`
 * automaticamente, mas o composition root real usava `{ count: 1000 }` — com
 * o volume baixo de envios de campanha, isso na prática NUNCA libera nada
 * (BullMQ só evict jobs antigos quando outro do mesmo tipo termina DEPOIS de
 * passar do limite; ver docstring de `KeepJobs` do próprio BullMQ). O
 * `jobId` de um job já concluído (ou falho, retido de propósito para
 * diagnóstico — `removeOnFail`) ficava OCUPADO para sempre, e um novo
 * `add()` com o MESMO `jobId` era silenciosamente ignorado — `startCampaign`/
 * `reopenCampaign` achavam que tinham reagendado, mas nada era criado.
 *
 * Corrigido removendo explicitamente qualquer job (completo, falho ou preso)
 * com este `jobId` ANTES de agendar um novo — garante que reagendar SEMPRE
 * funciona, independente da política de retenção configurada no Worker
 * (`queue.remove` é seguro/idempotente: devolve `0`, não lança, se o job já
 * não existir).
 */
export class BullMqCampaignSendDispatcher implements CampaignSendDispatcher {
  constructor(private readonly queue: Queue<CampaignSendJobData>) {}

  async scheduleRecipient(
    tenantId: string,
    campaignId: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void> {
    await this.queue.remove(recipientId);
    await this.queue.add(
      CAMPAIGN_SEND_JOB_NAME,
      { tenantId, campaignId, recipientId },
      { jobId: recipientId, delay: delayMs },
    );
  }
}
