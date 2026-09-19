import {
  isPlanDowngrade,
  planAllows,
  PLAN_ORDER,
  sessionLimitFor,
} from '../../../src/shared/tenant/domain/planCapabilities';

/**
 * A regra de plano (B5, 2026-09-18) — fonte única do que cada plano libera e
 * de quantos WhatsApps ele aceita. Substitui `planPermiteUso`, que só sabia
 * "pago libera tudo" e não comportava o plano Disparos (tudo menos IA).
 */
describe('planAllows', () => {
  it.each([
    ['free', false, false],
    ['broadcast', true, false],
    ['pro', true, true],
    ['enterprise', true, true],
  ] as const)('%s: operation=%s, ai=%s', (plan, operation, ai) => {
    expect(planAllows(plan, 'operation')).toBe(operation);
    expect(planAllows(plan, 'ai')).toBe(ai);
  });
});

describe('sessionLimitFor', () => {
  it.each([
    ['free', 1],
    ['broadcast', 1],
    ['pro', 1],
    ['enterprise', 5],
  ] as const)('%s permite %i WhatsApp(s)', (plan, limit) => {
    expect(sessionLimitFor(plan)).toBe(limit);
  });
});

describe('isPlanDowngrade (B5, etapa 3)', () => {
  it('devolve true só quando o novo plano vem ANTES do atual em PLAN_ORDER', () => {
    expect(isPlanDowngrade('enterprise', 'pro')).toBe(true);
    expect(isPlanDowngrade('enterprise', 'free')).toBe(true);
    expect(isPlanDowngrade('broadcast', 'free')).toBe(true);
  });

  it('plano igual não é descida', () => {
    expect(isPlanDowngrade('pro', 'pro')).toBe(false);
  });

  it('plano maior é subida, não descida', () => {
    expect(isPlanDowngrade('free', 'pro')).toBe(false);
    expect(isPlanDowngrade('broadcast', 'enterprise')).toBe(false);
  });

  it('PLAN_ORDER tem a ordem de venda, do menor para o maior', () => {
    expect(PLAN_ORDER).toEqual(['free', 'broadcast', 'pro', 'enterprise']);
  });
});
