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

  /**
   * Reagenda a MESMA repetição (que ainda não chegou a rodar) para dentro da
   * janela de horário — chamada de DENTRO da execução do próprio job de "run"
   * que está adiando a si mesmo (`GroupBroadcastRunJobProcessor`, achado real
   * de produção, 2026-09-15). NUNCA usa o mesmo `jobId` de `scheduleRun` para
   * este `runNumber`: como esta chamada acontece enquanto aquele job ainda
   * está `active` (travado pelo worker), tanto `queue.remove()` (o BullMQ
   * recusa remover job travado, sem lançar) quanto `queue.add()` (jobId já
   * existe, devolve o duplicado sem agendar nada) silenciosamente NÃO FAZEM
   * NADA — o job "postergado" nunca chegava a existir no Redis, e a
   * campanha ficava muda até uma ação manual. Terceira instância da mesma
   * classe de bug de colisão de `jobId` já documentada neste bounded
   * context, desta vez dentro do próprio ciclo de vida de um job, não entre
   * dois chamadores diferentes.
   */
  reschedulePostponedRun(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    runNumber: number,
    postponedTo: Date,
    delayMs: number,
  ): Promise<void>;
}
