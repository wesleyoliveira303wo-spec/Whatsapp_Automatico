import { TenantOverview } from '../../../../src/services/platform/domain/entities/TenantOverview';
import { buildActionQueue, withSignals } from '../../../../src/services/platform/domain/platformActionQueue';

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

describe('buildActionQueue (§5.1)', () => {
  it('nada precisa de atenção → lista vazia (vazia é sucesso)', () => {
    const rows = withSignals([overview({ id: 'ok' })], NOW);
    expect(buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 0 })).toEqual([]);
  });

  it('agrega "WhatsApp fora do ar" (sinal disconnected) com contagem e link', () => {
    const rows = withSignals(
      [
        overview({ id: 'a', sessionCount: 1, connectedSessionCount: 0 }),
        overview({ id: 'b', sessionCount: 2, connectedSessionCount: 0 }),
        overview({ id: 'ok' }),
      ],
      NOW,
    );
    const queue = buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 0 });
    const item = queue.find((i) => i.key === 'sessions_down');
    expect(item).toMatchObject({ severity: 'red', count: 2, href: '/admin/tenants' });
    expect(item?.label).toContain('2');
  });

  it('"nunca começou" é âmbar e separado do incidente técnico', () => {
    const rows = withSignals(
      [
        overview({ id: 'x', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
        overview({ id: 'y', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
      ],
      NOW,
    );
    const queue = buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 0 });
    expect(queue.map((i) => i.key)).toEqual(['never_started']);
    expect(queue[0]).toMatchObject({ severity: 'amber', count: 2 });
  });

  it('campanhas pausadas pelo disjuntor entram como item próprio (âmbar)', () => {
    const rows = withSignals([overview({ id: 'ok' })], NOW);
    const queue = buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 3 });
    expect(queue).toEqual([
      expect.objectContaining({ key: 'campaigns_breaker', severity: 'amber', count: 3 }),
    ]);
  });

  it('ordena por urgência: WhatsApp fora do ar > tenant em atenção > disjuntor > nunca começou', () => {
    const old = new Date(NOW.getTime() - 30 * 86400_000); // > 7 dias → "Sumiu"
    const rows = withSignals(
      [
        overview({ id: 'down', sessionCount: 1, connectedSessionCount: 0 }),
        overview({ id: 'vanished', lastActivityAt: old }),
        overview({ id: 'never', sessionCount: 0, lastActivityAt: null, messages30d: { inbound: 0, outbound: 0 } }),
      ],
      NOW,
    );
    const queue = buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 1 });
    expect(queue.map((i) => i.key)).toEqual([
      'sessions_down',
      'tenants_at_risk',
      'campaigns_breaker',
      'never_started',
    ]);
  });

  it('um tenant desconectado NÃO é contado também em "tenants em atenção"', () => {
    const rows = withSignals([overview({ id: 'a', sessionCount: 1, connectedSessionCount: 0 })], NOW);
    const queue = buildActionQueue({ tenants: rows, campaignsPausedByBreaker: 0 });
    expect(queue.map((i) => i.key)).toEqual(['sessions_down']);
  });
});
