import { planAllows, sessionLimitFor } from '../../../src/shared/tenant/domain/planCapabilities';

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
