import { TenantOverview } from '../../../../src/services/platform/domain/entities/TenantOverview';
import { TenantDetail } from '../../../../src/services/platform/domain/entities/TenantDetail';
import {
  ObservabilityRange,
  TenantObservabilityRepository,
} from '../../../../src/services/platform/domain/repositories/TenantObservabilityRepository';
import {
  OBSERVABILITY_WINDOW_DAYS,
  TenantObservabilityService,
} from '../../../../src/services/platform/application/TenantObservabilityService';

const NOW = new Date('2026-09-06T12:00:00Z');

function overview(patch: Partial<TenantOverview>): TenantOverview {
  return {
    id: 't',
    name: 'C',
    plan: 'free',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    sessionCount: 1,
    connectedSessionCount: 1,
    userCount: 1,
    lastActivityAt: new Date('2026-09-06T10:00:00Z'),
    messages30d: { inbound: 100, outbound: 100 },
    ai30d: { total: 10, success: 10, providerError: 0, validationRejected: 0, costUsd: '0' },
    conversations30d: { total: 10, escalated: 0 },
    aiProfileConfigured: true,
    ...patch,
  };
}

class FakeRepo implements TenantObservabilityRepository {
  lastRange: ObservabilityRange | null = null;
  constructor(
    private readonly overviews: TenantOverview[],
    private readonly detail: TenantDetail | null = null,
  ) {}

  async listTenantOverviews(range: ObservabilityRange): Promise<TenantOverview[]> {
    this.lastRange = range;
    return this.overviews;
  }

  async getTenantDetail(tenantId: string, range: ObservabilityRange): Promise<TenantDetail | null> {
    this.lastRange = range;
    return this.detail && this.detail.id === tenantId ? this.detail : null;
  }
}

describe('TenantObservabilityService.listTenants', () => {
  it('anexa os sinais de Domain a cada tenant', async () => {
    const repo = new FakeRepo([
      overview({ id: 'ok' }),
      overview({ id: 'down', sessionCount: 2, connectedSessionCount: 0 }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    expect(rows.find((r) => r.tenant.id === 'ok')?.signals[0].key).toBe('healthy');
    expect(rows.find((r) => r.tenant.id === 'down')?.signals[0].key).toBe('disconnected');
  });

  it('ordena por urgência: vermelho no topo, depois âmbar, depois verde', async () => {
    const repo = new FakeRepo([
      overview({ id: 'healthy' }),
      overview({ id: 'never', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
      overview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    expect(rows.map((r) => r.tenant.id)).toEqual(['down', 'never', 'healthy']);
  });

  it('empate de severidade → atividade mais recente primeiro, sem atividade por último, depois nome', async () => {
    const repo = new FakeRepo([
      overview({ id: 'b', name: 'Beta', sessionCount: 0, lastActivityAt: new Date('2026-09-05T00:00:00Z') }),
      overview({ id: 'a', name: 'Alfa', sessionCount: 0, lastActivityAt: new Date('2026-09-01T00:00:00Z') }),
      overview({ id: 'c', name: 'Gama', sessionCount: 0, lastActivityAt: new Date('2026-09-05T00:00:00Z') }),
      overview({ id: 'z', name: 'Zeta', sessionCount: 0, lastActivityAt: null }),
    ]);
    const service = new TenantObservabilityService(repo, () => NOW);

    const rows = await service.listTenants();

    // b/c empatam em 09-05 (nome desempata: Beta < Gama), depois a (09-01),
    // depois z (nunca teve atividade).
    expect(rows.map((r) => r.tenant.id)).toEqual(['b', 'c', 'a', 'z']);
  });

  it('pede ao repositório exatamente a janela de 30 dias terminando em agora', async () => {
    const repo = new FakeRepo([overview({ id: 't' })]);
    const service = new TenantObservabilityService(repo, () => NOW);

    await service.listTenants();

    expect(repo.lastRange?.to).toEqual(NOW);
    const expectedFrom = new Date(NOW.getTime() - OBSERVABILITY_WINDOW_DAYS * 86400_000);
    expect(repo.lastRange?.from).toEqual(expectedFrom);
  });
});

describe('TenantObservabilityService.getTenant', () => {
  const detail: TenantDetail = {
    ...overview({ id: 'exists' }),
    sessions: [],
    campaigns: { total: 0, running: 0, paused: 0, pausedByBreaker: 0 },
    contactCount: 0,
    recentSessionEvents: [],
  };

  it('devolve o detalhe com sinais anexados', async () => {
    const service = new TenantObservabilityService(new FakeRepo([], detail), () => NOW);

    const row = await service.getTenant('exists');

    expect(row?.tenant.id).toBe('exists');
    expect(row?.signals[0].key).toBe('healthy');
  });

  it('devolve null quando o tenant não existe', async () => {
    const service = new TenantObservabilityService(new FakeRepo([], detail), () => NOW);

    await expect(service.getTenant('ghost')).resolves.toBeNull();
  });
});
