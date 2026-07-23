import { BullMqAiReplyScheduler } from '../../../../src/services/conversations/infrastructure/schedulers/BullMqAiReplyScheduler';
import { AI_REPLY_JOB_NAME } from '../../../../src/services/conversations/infrastructure/queues/AiReplyQueue';

function createFakeQueue(): { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

describe('BullMqAiReplyScheduler', () => {
  describe('schedule()', () => {
    it('chama queue.add() com o nome do job, o payload e um jobId derivado de tenantId:conversationId:messageId', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

      expect(queue.add).toHaveBeenCalledWith(
        AI_REPLY_JOB_NAME,
        { tenantId: 'tenant-1', conversationId: 'conversation-1', messageId: 'message-1' },
        { jobId: 'tenant-1:conversation-1:message-1' },
      );
    });

    it('gera jobIds diferentes para conversas diferentes (não colide entre tenants/conversas)', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');
      await scheduler.schedule('tenant-2', 'conversation-1', 'message-1');

      const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
      expect(jobIds[0]).not.toBe(jobIds[1]);
    });

    it('propaga uma falha de queue.add() (não engole)', async () => {
      const queue = createFakeQueue();
      queue.add.mockRejectedValue(new Error('Falha simulada de conexão com Redis'));
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await expect(scheduler.schedule('tenant-1', 'conversation-1', 'message-1')).rejects.toThrow(
        'Falha simulada de conexão com Redis',
      );
    });
  });
});
