/**
 * Porta (port) de AGENDAMENTO do envio de um grupo-alvo — mesmo papel de
 * `CampaignSendDispatcher`. O Domain não sabe nada de BullMQ; quem implementa
 * (`BullMqGroupBroadcastSendDispatcher`) usa `jobId = targetId`.
 *
 * Pausar/cancelar NÃO toca a fila: o processor relê o status do disparo a cada
 * job e simplesmente não envia se ele não estiver `running`.
 */
export interface GroupBroadcastSendDispatcher {
  scheduleTarget(
    tenantId: string,
    broadcastId: string,
    targetId: string,
    delayMs: number,
  ): Promise<void>;
}
