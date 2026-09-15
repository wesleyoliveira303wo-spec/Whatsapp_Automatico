import { BullMqGroupBroadcastSendDispatcher } from '../../../../src/services/groupBroadcasts/infrastructure/dispatchers/BullMqGroupBroadcastSendDispatcher';
import { GROUP_BROADCAST_SEND_JOB_NAME } from '../../../../src/services/groupBroadcasts/infrastructure/queues/GroupBroadcastSendQueue';

function createFakeQueue(): { add: jest.Mock; remove: jest.Mock } {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    remove: jest.fn().mockResolvedValue(1),
  };
}

describe('BullMqGroupBroadcastSendDispatcher (Disparos em grupos, 2026-09-11, etapas paralelas 2026-09-14)', () => {
  describe('scheduleStepTarget()', () => {
    it('remove qualquer job antigo com o mesmo jobId ANTES de agendar o novo (bug de 2026-08-18 do motor de campanhas)', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await dispatcher.scheduleStepTarget('tenant-1', 'broadcast-1', 'step-1', 'step-target-1', 5000);

      expect(queue.remove).toHaveBeenCalledWith('step-target-1');
      const removeOrder = queue.remove.mock.invocationCallOrder[0];
      const addOrder = queue.add.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(addOrder);
    });

    it('agenda com o nome do job, o payload (com stepId) e jobId/delay corretos', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await dispatcher.scheduleStepTarget('tenant-1', 'broadcast-1', 'step-1', 'step-target-1', 5000);

      expect(queue.add).toHaveBeenCalledWith(
        GROUP_BROADCAST_SEND_JOB_NAME,
        {
          tenantId: 'tenant-1',
          broadcastId: 'broadcast-1',
          stepId: 'step-1',
          stepTargetId: 'step-target-1',
        },
        { jobId: 'step-target-1', delay: 5000 },
      );
    });

    it('funciona normalmente quando não havia job nenhum para remover', async () => {
      const queue = createFakeQueue();
      queue.remove.mockResolvedValue(0);
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleStepTarget('tenant-1', 'broadcast-1', 'step-1', 'step-target-1', 5000),
      ).resolves.toBeUndefined();
      expect(queue.add).toHaveBeenCalled();
    });

    it('propaga uma falha de queue.add() (não engole)', async () => {
      const queue = createFakeQueue();
      queue.add.mockRejectedValue(new Error('Falha simulada de conexão com Redis'));
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleStepTarget('tenant-1', 'broadcast-1', 'step-1', 'step-target-1', 5000),
      ).rejects.toThrow('Falha simulada de conexão com Redis');
    });

    // O incidente do "balão único" (CLAUDE.md §18, 2026-08-21): o BullMQ
    // recusa `jobId` com ':' a menos que tenha exatamente 3 partes.
    // `stepTargetId` é sempre um UUID puro (só `-`), mas a checagem nomeia o
    // culpado se isso um dia mudar, em vez do erro críptico da lib.
    it('lança um erro nomeando o problema se o stepTargetId contiver ":" (regra do BullMQ)', async () => {
      const queue = createFakeQueue();
      const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

      await expect(
        dispatcher.scheduleStepTarget('tenant-1', 'broadcast-1', 'step-1', 'tenant:step-target-1', 5000),
      ).rejects.toThrow(/jobId inválido/);
      expect(queue.remove).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});

describe('scheduleRun (recorrência por etapa, 2026-09-11/2026-09-14)', () => {
  it('usa um jobId por ETAPA+REPETIÇÃO, sem ":" e removendo o job anterior antes', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 'step-1', 3, 7200000);

    expect(queue.remove).toHaveBeenCalledWith('step-1-run-3');
    expect(queue.add).toHaveBeenCalledWith(
      'start-group-broadcast-run',
      { tenantId: 'tenant-1', broadcastId: 'broadcast-1', stepId: 'step-1', runNumber: 3 },
      { jobId: 'step-1-run-3', delay: 7200000 },
    );
    expect(queue.add.mock.calls[0][2].jobId).not.toContain(':');
  });

  it('repetições diferentes da mesma etapa nunca colidem no mesmo jobId', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 'step-1', 1, 0);
    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 'step-1', 2, 0);

    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(2);
  });

  it('a mesma repetição de ETAPAS diferentes nunca colide no mesmo jobId', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 'step-1', 1, 0);
    await dispatcher.scheduleRun('tenant-1', 'broadcast-1', 'step-2', 1, 0);

    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(2);
  });
});

describe('reschedulePostponedRun (achado real de produção, 2026-09-15)', () => {
  // Causa raiz medida em produção: `GroupBroadcastRunJobProcessor`, ao
  // descobrir que está fora da janela de horário, tentava reagendar a SI
  // MESMO chamando `scheduleRun` com o MESMO `runNumber` — ou seja, o MESMO
  // jobId (`${stepId}-run-${runNumber}`) do job que, naquele exato instante,
  // ainda está `active` (o worker o está processando). `Queue.remove()` do
  // BullMQ devolve 0 (sem lançar) quando o job está travado, e `Queue.add()`
  // com um jobId já existente cai no caminho de "job duplicado" do Lua e
  // devolve o job existente SEM criar nada no `delayed` set. As duas
  // chamadas silenciosamente não faziam nada, e o disparo nunca era
  // reagendado — a campanha ficava muda até uma pausa/retomada manual.
  it('NUNCA usa o mesmo jobId de scheduleRun para o mesmo runNumber (evita colidir com o job em execução)', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);
    const postponedTo = new Date('2026-09-15T10:00:00.000Z');

    await dispatcher.reschedulePostponedRun(
      'tenant-1',
      'broadcast-1',
      'step-1',
      1,
      postponedTo,
      7200000,
    );

    const jobId = queue.add.mock.calls[0][2].jobId;
    expect(jobId).not.toBe('step-1-run-1'); // o jobId do job em execução
    expect(jobId).not.toContain(':');
    expect(queue.remove).toHaveBeenCalledWith(jobId);
    expect(queue.add).toHaveBeenCalledWith(
      'start-group-broadcast-run',
      { tenantId: 'tenant-1', broadcastId: 'broadcast-1', stepId: 'step-1', runNumber: 1 },
      { jobId, delay: 7200000 },
    );
  });

  it('duas postergações da MESMA etapa/repetição para instantes diferentes nunca colidem no mesmo jobId', async () => {
    const queue = { add: jest.fn(), remove: jest.fn() };
    const dispatcher = new BullMqGroupBroadcastSendDispatcher(queue as never);

    await dispatcher.reschedulePostponedRun(
      'tenant-1',
      'broadcast-1',
      'step-1',
      1,
      new Date('2026-09-15T10:00:00.000Z'),
      0,
    );
    await dispatcher.reschedulePostponedRun(
      'tenant-1',
      'broadcast-1',
      'step-1',
      1,
      new Date('2026-09-16T10:00:00.000Z'),
      0,
    );

    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(2);
  });
});
