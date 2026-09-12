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

  /**
   * Agenda o INÍCIO de uma repetição (recorrência, 2026-09-11) para daqui a
   * `delayMs`. Um job por ciclo — os envios de cada grupo são agendados
   * depois, quando o ciclo começa.
   */
  scheduleRun(
    tenantId: string,
    broadcastId: string,
    runNumber: number,
    delayMs: number,
  ): Promise<void>;
}
