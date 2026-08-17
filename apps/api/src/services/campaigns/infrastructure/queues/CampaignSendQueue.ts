/**
 * Constantes/tipos da fila BullMQ `campaign-send` — Fase L, Bloco L4
 * (`FASE_L_MOTOR_DE_LEADS.md` §9.2: fila NOVA, deliberadamente separada de
 * `whatsapp-outbound` — perfil de tráfego oposto: lenta/espaçada, sem
 * ninguém esperando, falha só marca o destinatário e segue, volume de
 * centenas por campanha em vez de unitário. Misturar as duas colocaria a
 * resposta a um cliente real atrás de centenas de jobs de campanha).
 *
 * Vive em Infrastructure de `campaigns` (não em Domain): `CampaignSendDispatcher`
 * (Domain) não sabe nada sobre BullMQ — só quem implementa o port
 * (`BullMqCampaignSendDispatcher`) e quem consome a fila
 * (`CampaignSendJobProcessor`, instanciado dentro de `apps/api`, único dono
 * dos sockets — ADR #54) precisam deste nome/formato de job.
 */
export const CAMPAIGN_SEND_QUEUE_NAME = 'campaign-send';

export const CAMPAIGN_SEND_JOB_NAME = 'send-campaign-message';

/** Payload de um job `campaign-send` — o suficiente para o processor recarregar campanha e destinatário do banco antes de agir (nunca confia em dado do payload para decidir enviar ou não — ver docstring de `CampaignSendJobProcessor`). */
export interface CampaignSendJobData {
  tenantId: string;
  campaignId: string;
  recipientId: string;
}
