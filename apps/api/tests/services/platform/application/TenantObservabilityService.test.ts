import { TenantDetail } from '../../../../src/services/platform/domain/entities/TenantDetail';
import {
  OBSERVABILITY_WINDOW_DAYS,
  TenantObservabilityService,
} from '../../../../src/services/platform/application/TenantObservabilityService';
import type {
  LiveSessionStatus,
  PlatformLiveSessionStatusResolver,
  SessionRef,
} from '../../../../src/services/platform/domain/providers/PlatformLiveSessionStatusResolver';
import { FakeTenantObservabilityRepository, tenantOverview } from '../testDoubles';

const NOW = new Date('2026-09-06T12:00:00Z');

describe('TenantObservabilityService.listTenants', () => {
  it('anexa os sinais de Domain a cada tenant', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'ok' }),
      tenantOverview({ id: 'down', sessionCount: 2, connectedSessionCount: 0 }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    expect(rows.find((r) => r.tenant.id === 'ok')?.signals[0].key).toBe('healthy');
    expect(rows.find((r) => r.tenant.id === 'down')?.signals[0].key).toBe('disconnected');
  });

  it('ordena por urgência: vermelho no topo, depois âmbar, depois verde', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'healthy' }),
      tenantOverview({ id: 'never', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
      tenantOverview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    expect(rows.map((r) => r.tenant.id)).toEqual(['down', 'never', 'healthy']);
  });

  it('empate de severidade → atividade mais recente primeiro, sem atividade por último, depois nome', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 'b', name: 'Beta', sessionCount: 0, lastActivityAt: new Date('2026-09-05T00:00:00Z') }),
      tenantOverview({ id: 'a', name: 'Alfa', sessionCount: 0, lastActivityAt: new Date('2026-09-01T00:00:00Z') }),
      tenantOverview({ id: 'c', name: 'Gama', sessionCount: 0, lastActivityAt: new Date('2026-09-05T00:00:00Z') }),
      tenantOverview({ id: 'z', name: 'Zeta', sessionCount: 0, lastActivityAt: null }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    expect(rows.map((r) => r.tenant.id)).toEqual(['b', 'c', 'a', 'z']);
  });

  it('pede ao repositório exatamente a janela de 30 dias terminando em agora', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't' })]);
    const service = new TenantObservabilityService(repo, () => NOW);

    await service.listTenants();

    expect(repo.lastRange?.to).toEqual(NOW);
    const expectedFrom = new Date(NOW.getTime() - OBSERVABILITY_WINDOW_DAYS * 86400_000);
    expect(repo.lastRange?.from).toEqual(expectedFrom);
  });

  it('sem resolvedor ao vivo, não consulta as sessões cruas (comportamento da Fase 2)', async () => {
    const repo = new FakeTenantObservabilityRepository([tenantOverview({ id: 't' })]);
    const spy = jest.spyOn(repo, 'listAllSessions');
    const service = new TenantObservabilityService(repo, () => NOW);

    await service.listTenants();

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('TenantObservabilityService — sobreposição do status ao vivo (Fase 3, ADR #80)', () => {
  class FakeResolver implements PlatformLiveSessionStatusResolver {
    constructor(private readonly map: Map<string, LiveSessionStatus>, private readonly fail = false) {}
    async resolveLiveStatuses(_: SessionRef[]): Promise<Map<string, LiveSessionStatus>> {
      if (this.fail) throw new Error('registry indisponível');
      return this.map;
    }
  }

  it('registry ao vivo corrige um banco velho: overview dizia 0 conectadas, registry diz 1', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 't1', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    repo.allSessions = [{ tenantId: 't1', sessionName: 's1', status: 'DISCONNECTED' }];
    const service = new TenantObservabilityService(repo, () => NOW);
    service.setLiveSessionStatusResolver(new FakeResolver(new Map([['t1:s1', 'connected']])));

    const rows = await service.listTenants();

    expect(rows[0].tenant.connectedSessionCount).toBe(1);
    // Com 1 conectada, deixa de disparar "Desconectado".
    expect(rows[0].signals.some((s) => s.key === 'disconnected')).toBe(false);
  });

  it('resolvedor que lança não derruba o painel — cai para o valor do banco', async () => {
    const repo = new FakeTenantObservabilityRepository([
      tenantOverview({ id: 't1', sessionCount: 2, connectedSessionCount: 2 }),
    ]);
    repo.allSessions = [
      { tenantId: 't1', sessionName: 's1', status: 'CONNECTED' },
      { tenantId: 't1', sessionName: 's2', status: 'CONNECTED' },
    ];
    const service = new TenantObservabilityService(repo, () => NOW);
    service.setLiveSessionStatusResolver(new FakeResolver(new Map(), true));

    const rows = await service.listTenants();

    // Mapa ao vivo vazio → mantém os 2 do banco.
    expect(rows[0].tenant.connectedSessionCount).toBe(2);
  });
});

describe('TenantObservabilityService.getTenant', () => {
  const detail: TenantDetail = {
    ...tenantOverview({ id: 'exists' }),
    sessions: [],
    campaigns: { total: 0, running: 0, paused: 0, pausedByBreaker: 0 },
    contactCount: 0,
    recentSessionEvents: [],
  };

  it('devolve o detalhe com sinais anexados', async () => {
    const service = new TenantObservabilityService(
      new FakeTenantObservabilityRepository([], detail),
      () => NOW,
    );

    const row = await service.getTenant('exists');

    expect(row?.tenant.id).toBe('exists');
    expect(row?.signals[0].key).toBe('healthy');
  });

  it('devolve null quando o tenant não existe', async () => {
    const service = new TenantObservabilityService(
      new FakeTenantObservabilityRepository([], detail),
      () => NOW,
    );

    await expect(service.getTenant('ghost')).resolves.toBeNull();
  });
});
