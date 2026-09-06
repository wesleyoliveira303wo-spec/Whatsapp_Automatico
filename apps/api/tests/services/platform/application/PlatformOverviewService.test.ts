import { PlatformOverviewService } from '../../../../src/services/platform/application/PlatformOverviewService';
import { TenantObservabilityService } from '../../../../src/services/platform/application/TenantObservabilityService';
import {
  FakeTenantObservabilityRepository,
  emptyPlatformTotals,
  tenantOverview,
} from '../testDoubles';

const NOW = new Date('2026-09-06T12:00:00Z');

function build(repo: FakeTenantObservabilityRepository): PlatformOverviewService {
  const tenants = new TenantObservabilityService(repo, () => NOW);
  return new PlatformOverviewService(tenants, repo, () => NOW);
}

describe('PlatformOverviewService.getOverview', () => {
  it('repassa os KPIs globais de platformTotals sem mexer', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't1' })]);
    repo.totals = emptyPlatformTotals({
      tenants: { total: 21, byPlan: { free: 20, pro: 0, enterprise: 1 } },
      users: 27,
      messages30d: { inbound: 485, outbound: 1047 },
      ai30d: { total: 213, success: 156, providerError: 53, validationRejected: 4, costUsd: '0' },
    });

    const overview = await build(repo).getOverview();

    expect(overview.kpis.tenants).toEqual({ total: 21, byPlan: { free: 20, pro: 0, enterprise: 1 } });
    expect(overview.kpis.users).toBe(27);
    expect(overview.kpis.ai30d.providerError).toBe(53);
    expect(typeof overview.kpis.ai30d.costUsd).toBe('string');
  });

  it('conta tenants saudáveis vs. precisando de atenção pelos sinais', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'ok1' }),
      tenantOverview({ id: 'ok2' }),
      tenantOverview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
      tenantOverview({ id: 'never', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
    ]);

    const overview = await build(repo).getOverview();

    expect(overview.kpis.tenantsNeedingAttention).toBe(2);
    expect(overview.kpis.tenantsHealthy).toBe(2);
  });

  it('monta a Fila de ação a partir dos mesmos sinais + campanhas pausadas', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    repo.totals = emptyPlatformTotals({ campaigns: { running: 2, pausedByBreaker: 1 } });

    const overview = await build(repo).getOverview();

    expect(overview.actionQueue.map((i) => i.key)).toEqual(['sessions_down', 'campaigns_breaker']);
  });

  it('nada precisa de atenção → Fila de ação vazia', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 'ok' })]);

    const overview = await build(repo).getOverview();

    expect(overview.actionQueue).toEqual([]);
    expect(overview.kpis.tenantsNeedingAttention).toBe(0);
  });

  it('sessionsConnectedLive soma o conectado JÁ reconciliado da lista de tenants', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'a', sessionCount: 2, connectedSessionCount: 1 }),
      tenantOverview({ id: 'b', sessionCount: 1, connectedSessionCount: 1 }),
    ]);

    const overview = await build(repo).getOverview();

    expect(overview.kpis.sessionsConnectedLive).toBe(2);
  });
});
