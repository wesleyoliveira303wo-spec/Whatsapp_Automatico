import { TenantOverview } from '../../../../src/services/platform/domain/entities/TenantOverview';
import {
  AI_FAILING_ERROR_RATE,
  AI_STUCK_ESCALATION_RATE,
  NEVER_STARTED_MAX_MESSAGES,
  PLAN_MONTHLY_PRICE_USD,
  VANISHED_AFTER_DAYS,
  evaluateTenantSignals,
  hasHighCost,
  hasNeverStarted,
  hasVanished,
  isAiFailing,
  isAiStuck,
  isDisconnected,
  worstSignal,
} from '../../../../src/services/platform/domain/tenantSignals';

const NOW = new Date('2026-09-06T12:00:00Z');

function overview(patch: Partial<TenantOverview> = {}): TenantOverview {
  return {
    id: 't1',
    name: 'Cliente',
    plan: 'pro',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    sessionCount: 1,
    connectedSessionCount: 1,
    userCount: 1,
    lastActivityAt: new Date('2026-09-06T10:00:00Z'),
    messages30d: { inbound: 100, outbound: 200 },
    ai30d: { total: 50, success: 48, providerError: 1, validationRejected: 1, costUsd: '0' },
    conversations30d: { total: 40, escalated: 2 },
    aiProfileConfigured: true,
    ...patch,
  };
}

describe('tenantSignals — predicados individuais (§6.3)', () => {
  it('Desconectado: tem sessão registrada e nenhuma conectada', () => {
    expect(isDisconnected(overview({ sessionCount: 2, connectedSessionCount: 0 }))).toBe(true);
    // Sem sessão nenhuma NÃO é "desconectado" — é "nunca começou" (§6.3.1).
    expect(isDisconnected(overview({ sessionCount: 0, connectedSessionCount: 0 }))).toBe(false);
    expect(isDisconnected(overview({ sessionCount: 2, connectedSessionCount: 1 }))).toBe(false);
  });

  it('Sumiu: tem atividade e a última passou de VANISHED_AFTER_DAYS', () => {
    const oldMs = NOW.getTime() - (VANISHED_AFTER_DAYS + 1) * 86400_000;
    expect(hasVanished(overview({ lastActivityAt: new Date(oldMs) }), NOW)).toBe(true);

    const recentMs = NOW.getTime() - (VANISHED_AFTER_DAYS - 1) * 86400_000;
    expect(hasVanished(overview({ lastActivityAt: new Date(recentMs) }), NOW)).toBe(false);

    // Guarda do §6.3.1: sem atividade nenhuma, não "sumiu" — nunca apareceu.
    expect(hasVanished(overview({ lastActivityAt: null }), NOW)).toBe(false);
  });

  it('Nunca começou: sem sessão, OU conectada com poucas mensagens', () => {
    expect(hasNeverStarted(overview({ sessionCount: 0 }))).toBe(true);
    expect(
      hasNeverStarted(
        overview({
          sessionCount: 1,
          connectedSessionCount: 1,
          messages30d: { inbound: 3, outbound: 4 },
        }),
      ),
    ).toBe(true);
    expect(
      hasNeverStarted(
        overview({
          sessionCount: 1,
          connectedSessionCount: 1,
          messages30d: { inbound: NEVER_STARTED_MAX_MESSAGES, outbound: 0 },
        }),
      ),
    ).toBe(false);
  });

  it('IA travando: escalonamento acima de AI_STUCK_ESCALATION_RATE', () => {
    const total = 100;
    const over = Math.ceil(total * AI_STUCK_ESCALATION_RATE) + 1;
    expect(isAiStuck(overview({ conversations30d: { total, escalated: over } }))).toBe(true);
    expect(isAiStuck(overview({ conversations30d: { total, escalated: 5 } }))).toBe(false);
    // Sem conversa no período não dispara (evita divisão por zero).
    expect(isAiStuck(overview({ conversations30d: { total: 0, escalated: 0 } }))).toBe(false);
  });

  it('IA falhando: PROVIDER_ERROR acima de AI_FAILING_ERROR_RATE', () => {
    // O caso real medido: tenant-1 com 53/213 ≈ 24,9% → dispara.
    expect(
      isAiFailing(
        overview({ ai30d: { total: 213, success: 156, providerError: 53, validationRejected: 4, costUsd: '0' } }),
      ),
    ).toBe(true);
    expect(
      isAiFailing(
        overview({ ai30d: { total: 100, success: 90, providerError: 10, validationRejected: 0, costUsd: '0' } }),
      ),
    ).toBe(false);
    expect(AI_FAILING_ERROR_RATE).toBe(0.2);
  });

  it('Custo alto: custo de IA acima de 20% do preço do plano em USD', () => {
    const proPrice = PLAN_MONTHLY_PRICE_USD.pro;
    expect(
      hasHighCost(overview({ plan: 'pro', ai30d: { ...overview().ai30d, costUsd: String(proPrice * 0.5) } })),
    ).toBe(true);
    expect(
      hasHighCost(overview({ plan: 'pro', ai30d: { ...overview().ai30d, costUsd: String(proPrice * 0.1) } })),
    ).toBe(false);
    // No free tier o custo é 0 e o plano free tem preço 0 → nunca dispara.
    expect(hasHighCost(overview({ plan: 'free', ai30d: { ...overview().ai30d, costUsd: '0' } }))).toBe(
      false,
    );
  });
});

describe('evaluateTenantSignals — precedência e apresentação (§5.3/§6.3)', () => {
  it('sem nenhum problema → um único sinal Saudável, verde, com rótulo', () => {
    const signals = evaluateTenantSignals(overview(), NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ key: 'healthy', severity: 'green', label: 'Saudável' });
  });

  it('todo sinal carrega rótulo e leitura — cor nunca aparece sozinha', () => {
    const signals = evaluateTenantSignals(
      overview({ sessionCount: 1, connectedSessionCount: 0 }),
      NOW,
    );
    for (const s of signals) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.reading.length).toBeGreaterThan(0);
    }
  });

  it('vermelho vem antes de âmbar; Desconectado antes de Sumiu', () => {
    const oldMs = NOW.getTime() - (VANISHED_AFTER_DAYS + 2) * 86400_000;
    const signals = evaluateTenantSignals(
      overview({
        sessionCount: 2,
        connectedSessionCount: 0,
        lastActivityAt: new Date(oldMs),
        ai30d: { total: 10, success: 5, providerError: 5, validationRejected: 0, costUsd: '0' },
      }),
      NOW,
    );
    expect(signals.map((s) => s.key)).toEqual(['disconnected', 'vanished', 'ai_failing']);
    expect(worstSignal(signals).key).toBe('disconnected');
  });

  it('os 20 tenants sem sessão da base real → apenas "Nunca começou" (âmbar)', () => {
    const signals = evaluateTenantSignals(
      overview({
        sessionCount: 0,
        connectedSessionCount: 0,
        lastActivityAt: null,
        messages30d: { inbound: 0, outbound: 0 },
        ai30d: { total: 0, success: 0, providerError: 0, validationRejected: 0, costUsd: '0' },
        conversations30d: { total: 0, escalated: 0 },
        aiProfileConfigured: false,
      }),
      NOW,
    );
    expect(signals.map((s) => s.key)).toEqual(['never_started']);
    expect(signals[0].severity).toBe('amber');
  });

  it('múltiplos âmbares aparecem juntos, na ordem de avaliação', () => {
    const signals = evaluateTenantSignals(
      overview({
        conversations30d: { total: 100, escalated: 50 },
        ai30d: { total: 100, success: 50, providerError: 40, validationRejected: 10, costUsd: '0' },
      }),
      NOW,
    );
    expect(signals.map((s) => s.key)).toEqual(['ai_stuck', 'ai_failing']);
  });
});
