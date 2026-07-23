import { BullMqOutboundMessageDispatcher } from '../../../../src/services/whatsapp/infrastructure/dispatchers/BullMqOutboundMessageDispatcher';
import { WHATSAPP_OUTBOUND_JOB_NAME } from '../../../../src/services/whatsapp/infrastructure/queues/WhatsAppOutboundQueue';
import { OutboundMessageCommand } from '../../../../src/services/whatsapp/domain/dispatchers/OutboundMessageDispatcher';

function createFakeQueue(): { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

function buildCommand(overrides: Partial<OutboundMessageCommand> = {}): OutboundMessageCommand {
  return {
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    aiInteractionId: 'ai-interaction-1',
    content: 'Olá! Como posso ajudar?',
    ...overrides,
  };
}

describe('BullMqOutboundMessageDispatcher', () => {
  describe('dispatch()', () => {
    it('chama queue.add() com o nome do job, o comando como payload e jobId = aiInteractionId', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqOutboundMessageDispatcher(queue as never);
      const command = buildCommand();

      await dispatcher.dispatch(command);

      expect(queue.add).toHaveBeenCalledWith(WHATSAPP_OUTBOUND_JOB_NAME, command, { jobId: 'ai-interaction-1' });
    });

    it('mensagem de operador (sem aiInteractionId): jobId = idempotencyKey', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqOutboundMessageDispatcher(queue as never);
      const command = buildCommand({ aiInteractionId: undefined, idempotencyKey: 'agent-uuid-1' });

      await dispatcher.dispatch(command);

      expect(queue.add).toHaveBeenCalledWith(WHATSAPP_OUTBOUND_JOB_NAME, command, { jobId: 'agent-uuid-1' });
    });

    it('propaga uma falha de queue.add() (não engole)', async () => {
      const queue = createFakeQueue();
      queue.add.mockRejectedValue(new Error('Falha simulada de conexão com Redis'));
      const dispatcher = new BullMqOutboundMessageDispatcher(queue as never);

      await expect(dispatcher.dispatch(buildCommand())).rejects.toThrow('Falha simulada de conexão com Redis');
    });
  });
});
