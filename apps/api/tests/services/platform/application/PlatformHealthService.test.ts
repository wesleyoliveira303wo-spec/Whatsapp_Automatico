import { PlatformHealthService } from '../../../../src/services/platform/application/PlatformHealthService';
import { TenantObservabilityService } from '../../../../src/services/platform/application/TenantObservabilityService';
import type {
  PlatformHealthProbe,
  PlatformHealthSnapshot,
} from '../../../../src/services/platform/domain/providers/PlatformHealthProbe';
import {
  FakeTenantObservabilityRepository,
  emptyPlatformTotals,
  tenantOverview,
} from '../testDoubles';

const NOW = new Date('2026-09-06T12:00:00Z');

function build(repo: FakeTenantObservabilityRepository): PlatformHealthService {
  const tenants = new TenantObservabilityService(repo, () => NOW);
  return new PlatformHealthService(tenants, repo, () => NOW);
}

const SNAPSHOT: PlatformHealthSnapshot = {
  database: 'ok',
  redis: 'ok',
  queues: [
    { name: 'ai-reply', reachable: true, waiting: 3, active: 1, delayed: 0, failed: 12 },
    { name: 'whatsapp-outbound', reachable: true, waiting: 0, active: 0, delayed: 0, failed: 0 },
    { name: 'campaign-send', reachable: true, waiting: 0, active: 0, delayed: 0, failed: 0 },
  ],
};

class StubProbe implements PlatformHealthProbe {
  constructor(private readonly snap: PlatformHealthSnapshot) {}
  async snapshot(): Promise<PlatformHealthSnapshot> {
    return this.snap;
  }
}

describe('PlatformHealthService.getHealth', () => {
  it('sem probe injetado → infra: null (não finge número)', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]);

    const health = await build(repo).getHealth();

    expect(health.infra).toBeNull();
  });

  it('com probe → repassa o snapshot de infra tal e qual', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]);
    const service = build(repo);
    service.setHealthProbe(new StubProbe(SNAPSHOT));

    const health = await service.getHealth();

    expect(health.infra).toEqual(SNAPSHOT);
  });

  it('taxa de falha de IA = providerError / total; null quando total = 0', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]);
    repo.totals = emptyPlatformTotals({
      ai30d: { total: 213, success: 156, providerError: 53, validationRejected: 4, costUsd: '0' },
    });

    const health = await build(repo).getHealth();

    expect(health.aiFailures30d).toEqual({ total: 213, providerError: 53, rate: 53 / 213 });
  });

  it('taxa null quando não houve interação nenhuma', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]);

    const health = await build(repo).getHealth();

    expect(health.aiFailures30d.rate).toBeNull();
  });

  it('conta os tenants com WhatsApp fora do ar (sinal disconnected)', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'a', sessionCount: 1, connectedSessionCount: 0 }),
      tenantOverview({ id: 'b', sessionCount: 2, connectedSessionCount: 0 }),
      tenantOverview({ id: 'ok' }),
    ]);

    const health = await build(repo).getHealth();

    expect(health.tenantsWithSessionsDown).toBe(2);
  });
});
