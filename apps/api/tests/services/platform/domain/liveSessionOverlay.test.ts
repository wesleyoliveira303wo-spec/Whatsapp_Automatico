import { TenantOverview } from '../../../../src/services/platform/domain/entities/TenantOverview';
import { applyLiveSessionOverlay } from '../../../../src/services/platform/domain/liveSessionOverlay';
import type { LiveSessionStatus } from '../../../../src/services/platform/domain/providers/PlatformLiveSessionStatusResolver';

function overview(id: string, patch: Partial<TenantOverview> = {}): TenantOverview {
  return {
    id,
    name: id,
    plan: 'free',
    createdAt: new Date(),
    sessionCount: 0,
    connectedSessionCount: 0,
    userCount: 0,
    lastActivityAt: null,
    messages30d: { inbound: 0, outbound: 0 },
    ai30d: { total: 0, success: 0, providerError: 0, validationRejected: 0, costUsd: '0' },
    conversations30d: { total: 0, escalated: 0 },
    aiProfileConfigured: false,
    ...patch,
  };
}

describe('applyLiveSessionOverlay (ADR #80)', () => {
  it('sobrepõe o status do banco pelo status ao vivo e recalcula o conectado', () => {
    // Banco diz: t1 tem 2 sessões, ambas connected. Ao vivo: uma caiu.
    const overviews = [overview('t1', { sessionCount: 2, connectedSessionCount: 2 })];
    const raw = [
      { tenantId: 't1', sessionName: 's1', status: 'connected' as LiveSessionStatus },
      { tenantId: 't1', sessionName: 's2', status: 'connected' as LiveSessionStatus },
    ];
    const live = new Map<string, LiveSessionStatus>([['t1:s2', 'disconnected']]);

    const [result] = applyLiveSessionOverlay(overviews, raw, live);

    expect(result.sessionCount).toBe(2); // nunca muda
    expect(result.connectedSessionCount).toBe(1); // s1 ao vivo connected, s2 caiu
  });

  it('sessão AUSENTE do mapa ao vivo mantém o valor do banco', () => {
    // Banco diz disconnected; sem instância viva → continua disconnected.
    const overviews = [overview('t1', { sessionCount: 1, connectedSessionCount: 1 })];
    const raw = [{ tenantId: 't1', sessionName: 's1', status: 'disconnected' as LiveSessionStatus }];

    const [result] = applyLiveSessionOverlay(overviews, raw, new Map());

    expect(result.connectedSessionCount).toBe(0);
  });

  it('registry ao vivo CORRIGE um banco velho que ainda diz disconnected', () => {
    // Cenário pós-reinício: banco congelado em disconnected, mas a sessão
    // reconectou e o registry sabe.
    const overviews = [overview('t1', { sessionCount: 1, connectedSessionCount: 0 })];
    const raw = [{ tenantId: 't1', sessionName: 's1', status: 'disconnected' as LiveSessionStatus }];
    const live = new Map<string, LiveSessionStatus>([['t1:s1', 'connected']]);

    const [result] = applyLiveSessionOverlay(overviews, raw, live);

    expect(result.connectedSessionCount).toBe(1);
  });

  it('tenant sem sessão nenhuma passa intacto', () => {
    const overviews = [overview('t1', { sessionCount: 0, connectedSessionCount: 0 })];
    const [result] = applyLiveSessionOverlay(overviews, [], new Map());
    expect(result).toEqual(overviews[0]);
  });

  it('não muta o overview original', () => {
    const original = overview('t1', { sessionCount: 1, connectedSessionCount: 1 });
    const raw = [{ tenantId: 't1', sessionName: 's1', status: 'connected' as LiveSessionStatus }];
    applyLiveSessionOverlay([original], raw, new Map([['t1:s1', 'disconnected']]));
    expect(original.connectedSessionCount).toBe(1);
  });
});
