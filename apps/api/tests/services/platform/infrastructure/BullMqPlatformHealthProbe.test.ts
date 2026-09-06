import {
  BullMqPlatformHealthProbe,
  DatabasePinger,
  QueueCountsReader,
} from '../../../../src/services/platform/infrastructure/BullMqPlatformHealthProbe';

function okDb(): DatabasePinger {
  return { ping: async () => [{ '?column?': 1 }] };
}
function downDb(): DatabasePinger {
  return { ping: () => new Promise(() => {}) }; // nunca resolve
}
function okQueue(name: string, counts: Partial<Record<string, number>> = {}): QueueCountsReader {
  return { name, getJobCounts: async () => ({ waiting: 0, active: 0, delayed: 0, failed: 0, ...counts }) };
}
function downQueue(name: string): QueueCountsReader {
  return { name, getJobCounts: () => new Promise(() => {}) };
}

const FAST_TIMEOUT = 40;

describe('BullMqPlatformHealthProbe', () => {
  it('tudo de pé → database ok, redis ok, as 3 filas reachable', async () => {
    const probe = new BullMqPlatformHealthProbe(
      okDb(),
      [okQueue('ai-reply', { failed: 12 }), okQueue('whatsapp-outbound'), okQueue('campaign-send')],
      FAST_TIMEOUT,
    );

    const snap = await probe.snapshot();

    expect(snap.database).toBe('ok');
    expect(snap.redis).toBe('ok');
    expect(snap.queues.map((q) => q.name)).toEqual([
      'ai-reply',
      'whatsapp-outbound',
      'campaign-send',
    ]);
    expect(snap.queues[0]).toMatchObject({ reachable: true, failed: 12 });
  });

  it('Postgres pendurado → database down, mas não trava o probe (teto de tempo)', async () => {
    const probe = new BullMqPlatformHealthProbe(downDb(), [okQueue('ai-reply')], FAST_TIMEOUT);

    const snap = await probe.snapshot();

    expect(snap.database).toBe('down');
    expect(snap.redis).toBe('ok');
  });

  it('todas as filas penduradas → redis down e lista de filas vazia', async () => {
    const probe = new BullMqPlatformHealthProbe(
      okDb(),
      [downQueue('ai-reply'), downQueue('whatsapp-outbound'), downQueue('campaign-send')],
      FAST_TIMEOUT,
    );

    const snap = await probe.snapshot();

    expect(snap.redis).toBe('down');
    expect(snap.queues).toEqual([]);
  });

  it('uma fila pendurada não some com as outras — redis segue ok', async () => {
    const probe = new BullMqPlatformHealthProbe(
      okDb(),
      [okQueue('ai-reply'), downQueue('whatsapp-outbound'), okQueue('campaign-send')],
      FAST_TIMEOUT,
    );

    const snap = await probe.snapshot();

    expect(snap.redis).toBe('ok');
    expect(snap.queues.find((q) => q.name === 'whatsapp-outbound')).toMatchObject({
      reachable: false,
    });
    expect(snap.queues.find((q) => q.name === 'ai-reply')).toMatchObject({ reachable: true });
  });
});
