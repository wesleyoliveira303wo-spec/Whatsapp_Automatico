import {
  BullMqStageClassificationScheduler,
  DEFAULT_STAGE_CLASSIFY_DELAY_MS,
} from '../../../../src/services/conversations/infrastructure/schedulers/BullMqStageClassificationScheduler';
import { STAGE_CLASSIFY_JOB_NAME } from '../../../../src/services/conversations/infrastructure/queues/AiReplyQueue';

function createFakeQueue(): { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

describe('BullMqStageClassificationScheduler', () => {
  it('agenda o job de classificação com atraso padrão e jobId por mensagem', async () => {
    const queue = createFakeQueue();
    const scheduler = new BullMqStageClassificationScheduler(queue as never);

    await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

    expect(queue.add).toHaveBeenCalledWith(
      STAGE_CLASSIFY_JOB_NAME,
      { tenantId: 'tenant-1', conversationId: 'conversation-1', messageId: 'message-1' },
      { jobId: 'stage-tenant-1-conversation-1-message-1', delay: DEFAULT_STAGE_CLASSIFY_DELAY_MS },
    );
  });

  // Trava de regressão (incidente do balão único, 2026-08-21): o BullMQ recusa
  // `jobId` com `:` salvo com exatamente 3 partes.
  it('o jobId nunca contém ":"', async () => {
    const queue = createFakeQueue();
    const scheduler = new BullMqStageClassificationScheduler(queue as never, 1000);

    await scheduler.schedule('tenant-1', 'conversation-1', 'message-1');

    expect(queue.add.mock.calls[0][2].jobId).not.toContain(':');
    expect(queue.add.mock.calls[0][2].delay).toBe(1000);
  });
});
