import { BullMqAiReplyScheduler } from '../../../../src/services/conversations/infrastructure/schedulers/BullMqAiReplyScheduler';
import { AI_REPLY_JOB_NAME } from '../../../../src/services/conversations/infrastructure/queues/AiReplyQueue';

function createFakeQueue(): { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

describe('BullMqAiReplyScheduler', () => {
  describe('schedule()', () => {
    it('chama queue.add() com o nome do job, o payload e um jobId por MENSAGEM, com atraso', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never, 8000);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

      expect(queue.add).toHaveBeenCalledWith(
        AI_REPLY_JOB_NAME,
        { tenantId: 'tenant-1', conversationId: 'conversation-1', messageId: 'message-1' },
        { jobId: 'tenant-1:conversation-1:message-1', delay: 8000 },
      );
    });

    // Trava de regressão: um `jobId` por CONVERSA chegou a ser implementado
    // como forma de agrupar rajadas e foi revertido — o descarte de duplicata
    // do BullMQ vale enquanto a chave existir em Redis (inclusive `active` e
    // `failed`), então mensagens sumiam durante o processamento e um job
    // falho matava a IA da conversa permanentemente. O agrupamento é
    // resolvido por estado, em `shouldGenerateReply`.
    it('usa jobIds DIFERENTES para mensagens diferentes da mesma conversa (nenhuma mensagem pode ser descartada pela fila)', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');
      await scheduler.schedule('tenant-1', 'conversation-1', 'message-2');
      await scheduler.schedule('tenant-1', 'conversation-1', 'message-3');

      const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
      expect(new Set(jobIds).size).toBe(3);
    });

    it('reusa o MESMO jobId para a mesma mensagem (protege contra ingestão dupla do mesmo evento)', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');
      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

      const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
      expect(jobIds[0]).toBe(jobIds[1]);
    });

    it('sempre agenda com atraso (a janela de agrupamento não pode ser zero por acidente)', async () => {
      const queue = createFakeQueue();
      const scheduler = new BullMqAiReplyScheduler(queue as never);

      await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

      expect(queue.add.mock.calls[0][2].delay).toBeGreaterThan(0);
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
