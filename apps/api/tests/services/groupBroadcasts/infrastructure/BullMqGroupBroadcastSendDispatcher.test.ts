import { BullMqGroupBroadcastSendDispatcher } from '../../../../src/services/groupBroadcasts/infrastructure/dispatchers/BullMqGroupBroadcastSendDispatcher';
import { GROUP_BROADCAST_SEND_JOB_NAME } from '../../../../src/services/groupBroadcasts/infrastructure/queues/GroupBroadcastSendQueue';

function createFakeQueue(): { add: jest.Mock; remove: jest.Mock } {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    remove: jest.fn().mockResolvedValue(1),
  };
}

describe('BullMqGroupBroadcastSendDispatcher (Disparos em grupos, 2026-09-11)', () => {
  describe('scheduleTarget()', () => {
    it('remove qualquer job antigo com o mesmo jobId ANTES de agendar o novo (bug de 2026-08-18 do motor de campanhas)', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await dispatcher.scheduleTarget('tenant-1', 'broadcast-1', 'target-1', 5000);

      expect(queue.remove).toHaveBeenCalledWith('target-1');
      const removeOrder = queue.remove.mock.invocationCallOrder[0];
      const addOrder = queue.add.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(addOrder);
    });

    it('agenda com o nome do job, o payload e jobId/delay corretos', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await dispatcher.scheduleTarget('tenant-1', 'broadcast-1', 'target-1', 5000);

      expect(queue.add).toHaveBeenCalledWith(
        GROUP_BROADCAST_SEND_JOB_NAME,
        { tenantId: 'tenant-1', broadcastId: 'broadcast-1', targetId: 'target-1' },
        { jobId: 'target-1', delay: 5000 },
      );
    });

    it('funciona normalmente quando não havia job nenhum para remover', async () => {
      const queue = createFakeQueue();
      queue.remove.mockResolvedValue(0);
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleTarget('tenant-1', 'broadcast-1', 'target-1', 5000),
      ).resolves.toBeUndefined();
      expect(queue.add).toHaveBeenCalled();
    });

    it('propaga uma falha de queue.add() (não engole)', async () => {
      const queue = createFakeQueue();
      queue.add.mockRejectedValue(new Error('Falha simulada de conexão com Redis'));
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleTarget('tenant-1', 'broadcast-1', 'target-1', 5000),
      ).rejects.toThrow('Falha simulada de conexão com Redis');
    });

    // O incidente do "balão único" (CLAUDE.md §18, 2026-08-21): o BullMQ
    // recusa `jobId` com ':' a menos que tenha exatamente 3 partes. `targetId`
    // é sempre um UUID puro (só `-`), mas a checagem nomeia o culpado se isso
    // um dia mudar, em vez do erro críptico da lib.
    it('lança um erro nomeando o problema se o targetId contiver ":" (regra do BullMQ)', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleTarget('tenant-1', 'broadcast-1', 'tenant:target-1', 5000),
      ).rejects.toThrow(/jobId inválido/);
      expect(queue.remove).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});

describe('scheduleRun (recorrência, 2026-09-11)', () => {
  it('usa um jobId por REPETIÇÃO, sem ":" e removendo o job anterior antes', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 3, 7200000);

    expect(queue.remove).toHaveBeenCalledWith('broadcast-1-run-3');
    expect(queue.add).toHaveBeenCalledWith(
      'start-group-broadcast-run',
      { tenantId: 'tenant-1', broadcastId: 'broadcast-1', runNumber: 3 },
      { jobId: 'broadcast-1-run-3', delay: 7200000 },
    );
    expect(queue.add.mock.calls[0][2].jobId).not.toContain(':');
  });

  it('repetições diferentes nunca colidem no mesmo jobId', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 1, 0);
    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 2, 0);

    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(2);
  });
});
