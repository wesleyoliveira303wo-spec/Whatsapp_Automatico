import { GroupBroadcastMediaContentType } from '../entities/GroupBroadcast';

/** Anexo JÁ RESOLVIDO (binário em memória) de um envio em grupo — mesmo papel de `CampaignSendMedia`. */
export interface GroupSendMedia {
  contentType: GroupBroadcastMediaContentType;
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

/**
 * Resultado de UMA tentativa de publicação — nunca lança (mesmo contrato de
 * `CampaignMessageSendResult`): o processor decide o que fazer com a falha, e
 * o motivo textual vira `GroupBroadcastTarget.errorMessage`.
 */
export interface GroupMessageSendResult {
  ok: boolean;
  failureReason?: string;
}

/**
 * Porta (port) de ENVIO de uma mensagem para UM grupo — Disparos em grupos
 * (2026-09-11). Declarada no lado consumidor, implementada em
 * `services/whatsapp/infrastructure/WhatsAppGroupMessageSender` (único dono dos
 * sockets, ADR #54).
 *
 * Diferente de `CampaignMessageSender`, NUNCA cria `WhatsAppConversation` nem
 * `WhatsAppMessage`: grupo é destino de publicação, não uma conversa do CRM.
 * Com `media`, `content` vira a legenda (uma mensagem só).
 */
export interface GroupMessageSender {
  send(
    tenantId: string,
    sessionName: string,
    groupJid: string,
    content: string,
    media?: GroupSendMedia,
  ): Promise<GroupMessageSendResult>;
}
