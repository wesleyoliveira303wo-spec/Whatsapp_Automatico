import { BullMqCampaignSendDispatcher } from '../../../../src/services/campaigns/infrastructure/dispatchers/BullMqCampaignSendDispatcher';
import { CAMPAIGN_SEND_JOB_NAME } from '../../../../src/services/campaigns/infrastructure/queues/CampaignSendQueue';

function createFakeQueue(): { add: jest.Mock; remove: jest.Mock } {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    remove: jest.fn().mockResolvedValue(1),
  };
}

describe('BullMqCampaignSendDispatcher (correção 2026-08-18 — reagendar sempre funciona)', () => {
  describe('scheduleRecipient()', () => {
    it('remove qualquer job antigo com o mesmo jobId ANTES de agendar o novo', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqCampaignSendDispatcher(queue as never);

      await dispatcher.scheduleRecipient('tenant-1', 'campaign-1', 'recipient-1', 5000);

      expect(queue.remove).toHaveBeenCalledWith('recipient-1');
      // `remove` precisa acontecer ANTES do `add` — senão o `add` pode ver o
      // job antigo ainda lá e ser ignorado pelo BullMQ (mesmo jobId).
      const removeOrder = queue.remove.mock.invocationCallOrder[0];
      const addOrder = queue.add.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(addOrder);
    });

    it('agenda com o nome do job, o payload e jobId/delay corretos', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqCampaignSendDispatcher(queue as never);

      await dispatcher.scheduleRecipient('tenant-1', 'campaign-1', 'recipient-1', 5000);

      expect(queue.add).toHaveBeenCalledWith(
        CAMPAIGN_SEND_JOB_NAME,
        { tenantId: 'tenant-1', campaignId: 'campaign-1', recipientId: 'recipient-1' },
        { jobId: 'recipient-1', delay: 5000 },
      );
    });

    it('funciona normalmente quando não havia job nenhum para remover (queue.remove devolve 0)', async () => {
      const queue = createFakeQueue();
      queue.remove.mockResolvedValue(0);
      const dispatcher = new BullMqCampaignSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleRecipient('tenant-1', 'campaign-1', 'recipient-1', 5000),
      ).resolves.toBeUndefined();
      expect(queue.add).toHaveBeenCalled();
    });

    it('propaga uma falha de queue.add() (não engole)', async () => {
      const queue = createFakeQueue();
      queue.add.mockRejectedValue(new Error('Falha simulada de conexão com Redis'));
      const dispatcher = new BullMqCampaignSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleRecipient('tenant-1', 'campaign-1', 'recipient-1', 5000),
      ).rejects.toThrow('Falha simulada de conexão com Redis');
    });
  });
});
