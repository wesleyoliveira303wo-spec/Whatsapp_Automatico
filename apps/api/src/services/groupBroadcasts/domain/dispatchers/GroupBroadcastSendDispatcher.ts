/**
 * Porta (port) de AGENDAMENTO do envio de um grupo-alvo — mesmo papel de
 * `CampaignSendDispatcher`. O Domain não sabe nada de BullMQ; quem implementa
 * (`BullMqGroupBroadcastSendDispatcher`) usa `jobId = stepTargetId`.
 *
 * Pausar/cancelar NÃO toca a fila: o processor relê o status do disparo a cada
 * job e simplesmente não envia se ele não estiver `running`. Desde 2026-09-14
 * ("cadência entre publicações"), cada etapa agenda seu PRÓPRIO ciclo,
 * independente das demais — não existe mais "avançar para a próxima etapa".
 */
export interface GroupBroadcastSendDispatcher {
  scheduleStepTarget(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    stepTargetId: string,
    delayMs: number,
  ): Promise<void>;

  /**
   * Agenda o INÍCIO de uma repetição de UMA ETAPA (ou o lançamento inicial
   * dela, escalonado) para daqui a `delayMs`. Um job por ciclo por etapa — os
   * envios de cada grupo são agendados depois, quando o ciclo começa.
   */
  scheduleRun(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    runNumber: number,
    delayMs: number,
  ): Promise<void>;
}
