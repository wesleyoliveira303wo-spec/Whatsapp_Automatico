import {
  PLAN_LABEL,
  PLAN_ORDER,
  planAllows,
  sessionLimitFor,
} from '../../lib/plans';

/**
 * Espelho da regra de plano da API (`planCapabilities.ts`). Mesma tabela do
 * teste de lá, de propósito: se uma mudar e a outra não, um dos dois quebra.
 */
describe('planAllows (painel)', () => {
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

describe('sessionLimitFor (painel)', () => {
  it.each([
    ['free', 1],
    ['broadcast', 1],
    ['pro', 1],
    ['enterprise', 5],
  ] as const)('%s permite %i WhatsApp(s)', (plan, limit) => {
    expect(sessionLimitFor(plan)).toBe(limit);
  });
});

it('rótulos na ordem de venda', () => {
  expect(PLAN_ORDER.map((plan) => PLAN_LABEL[plan])).toEqual([
    'Grátis',
    'Disparos',
    'Pro',
    'Enterprise',
  ]);
});
