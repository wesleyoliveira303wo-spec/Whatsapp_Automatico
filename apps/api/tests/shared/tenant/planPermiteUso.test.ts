import { planPermiteUso } from '../../../src/shared/tenant/domain/planPermiteUso';

/**
 * Predicado puro da Trava de plano (Lançamento suave — ver `CONTEXT.md`).
 * Fonte única de verdade: um tenant no Plano Grátis não usa os recursos
 * pagos; Pro e Enterprise usam.
 */
describe('planPermiteUso', () => {
  it('retorna false para o Plano Grátis', () => {
    expect(planPermiteUso('free')).toBe(false);
  });

  it('retorna true para o Plano Pro', () => {
    expect(planPermiteUso('pro')).toBe(true);
  });

  it('retorna true para o Plano Enterprise', () => {
    expect(planPermiteUso('enterprise')).toBe(true);
  });
});
