/**
 * Porta (port) do PRODUTOR da fila `campaign-send` — Fase L, Bloco L4. Mesmo
 * papel de `OutboundMessageDispatcher`/`AiReplyScheduler`: `CampaignService`
 * chama isto ao iniciar/retomar uma campanha, sem conhecer BullMQ.
 *
 * `delayMs` já vem CALCULADO pelo chamador (`computeSendDelayMs`, Domain
 * puro) — este port só agenda, não decide ritmo.
 *
 * IDEMPOTÊNCIA: a implementação real usa `jobId = recipientId` — um mesmo
 * destinatário nunca tem dois jobs pendentes ao mesmo tempo (camada 2 de
 * `FASE_L_MOTOR_DE_LEADS.md` §9.4). Combinado com `removeOnComplete: true`
 * (mesmo padrão da fila `ai-reply`, ver `shouldGenerateReply`/agrupamento em
 * rajada), um job que roda e não faz nada (campanha pausada) libera o
 * `jobId` — é isso que permite `startCampaign` reagendar, com segurança, os
 * destinatários ainda `PENDING` ao retomar uma campanha pausada.
 */
export interface CampaignSendDispatcher {
  scheduleRecipient(
    tenantId: string,
    campaignId: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void>;
}
