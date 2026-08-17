import { shouldTripCircuitBreaker } from '../../../../src/services/campaigns/domain/policies/shouldTripCircuitBreaker';

describe('shouldTripCircuitBreaker (Fase L, Bloco L4)', () => {
  it('não trava com amostra abaixo do mínimo, mesmo com 100% de falha', () => {
    expect(shouldTripCircuitBreaker(['failed', 'failed', 'failed'])).toBe(false);
  });

  it('não trava com taxa de falha baixa (amostra suficiente)', () => {
    expect(shouldTripCircuitBreaker(['sent', 'sent', 'sent', 'sent', 'failed'])).toBe(false); // 20%
  });

  it('trava quando a taxa de falha ultrapassa o limiar padrão (40%)', () => {
    expect(shouldTripCircuitBreaker(['failed', 'failed', 'failed', 'sent', 'sent'])).toBe(true); // 60%
  });

  it('não trava exatamente NO limiar (>, não >=)', () => {
    expect(shouldTripCircuitBreaker(['failed', 'failed', 'sent', 'sent', 'sent'])).toBe(false); // 40% == limiar
  });

  it('100% de falha sempre trava (amostra suficiente)', () => {
    expect(shouldTripCircuitBreaker(['failed', 'failed', 'failed', 'failed', 'failed'])).toBe(true);
  });

  it('0% de falha nunca trava', () => {
    expect(shouldTripCircuitBreaker(['sent', 'sent', 'sent', 'sent', 'sent', 'sent'])).toBe(false);
  });

  it('respeita opções customizadas (minSampleSize/maxFailureRate)', () => {
    expect(
      shouldTripCircuitBreaker(['failed', 'failed'], { minSampleSize: 2, maxFailureRate: 0.4 }),
    ).toBe(true);
    expect(
      shouldTripCircuitBreaker(['failed', 'sent'], { minSampleSize: 2, maxFailureRate: 0.6 }),
    ).toBe(false); // 50% <= 60%
  });

  it('amostra vazia nunca trava', () => {
    expect(shouldTripCircuitBreaker([])).toBe(false);
  });
});
