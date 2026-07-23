import {
  OutboundMessageCommand,
  OutboundMessageDispatcher,
} from '../../../../src/services/whatsapp/domain/dispatchers/OutboundMessageDispatcher';

/**
 * Fake de `OutboundMessageDispatcher` (Milestone 3, Bloco 4, ADR #54) — em
 * memória, sem BullMQ/Redis. Mesmo papel de `FakeAiReplyScheduler`
 * (`apps/api/tests/services/conversations/testDoubles.ts`): registra as
 * chamadas a `dispatch()` para inspeção pelos testes, e permite simular uma
 * falha (`failNextDispatch`) para provar que quem chama este port não
 * engole um erro de publicação — mesmo racional já usado em
 * `FakeAiReplyScheduler.failNextSchedule`.
 *
 * Consumido por `AiReplyJobProcessor.test.ts` (worker de IA, Bloco 4): a
 * classe testada não conhece BullMQ, só este port — não há necessidade de
 * Redis real para testar a orquestração do job.
 */
export class FakeOutboundMessageDispatcher implements OutboundMessageDispatcher {
  public readonly dispatchCalls: OutboundMessageCommand[] = [];

  public failNextDispatch = false;

  async dispatch(command: OutboundMessageCommand): Promise<void> {
    if (this.failNextDispatch) {
      this.failNextDispatch = false;
      throw new Error('Falha simulada no OutboundMessageDispatcher');
    }
    this.dispatchCalls.push(command);
  }
}
