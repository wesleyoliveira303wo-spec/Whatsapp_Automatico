import {
  toAiUsageChartPoints,
  fillMissingDays,
  zeroMessageFlowPoint,
  sumCostUsd,
  presetRange,
} from '../../lib/analyticsView';
import type { AiUsagePoint } from '../../lib/clientApi';

function buildPoint(overrides: Partial<AiUsagePoint> = {}): AiUsagePoint {
  return {
    date: '2026-07-05',
    interactions: 3,
    successCount: 2,
    validationRejectedCount: 0,
    providerErrorCount: 1,
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: '0.00123456',
    avgLatencyMs: 420,
    ...overrides,
  };
}

describe('analyticsView (Milestone 4, Bloco M4E - logica pura, projeto node)', () => {
  describe('toAiUsageChartPoints (D46: conversao so na fronteira do grafico)', () => {
    it('converte costUsd para number SO no campo do eixo, preservando a string original', () => {
      const [point] = toAiUsageChartPoints([buildPoint({ costUsd: '0.00123456' })]);

      expect(point.costUsdNumber).toBeCloseTo(0.00123456);
      expect(point.costUsd).toBe('0.00123456');
      expect(typeof point.costUsd).toBe('string');
    });

    it('soma tokens de entrada e saida', () => {
      const [point] = toAiUsageChartPoints([buildPoint({ tokensInput: 100, tokensOutput: 50 })]);
      expect(point.tokensTotal).toBe(150);
    });
  });

  describe('fillMissingDays', () => {
    it('preenche dias vazios com o zero-point', () => {
      const result = fillMissingDays(
        [{ date: '2026-07-02', inbound: 5, outbound: 1 }],
        '2026-07-01',
        '2026-07-03',
        zeroMessageFlowPoint,
      );

      expect(result.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
      expect(result[0]).toEqual({ date: '2026-07-01', inbound: 0, outbound: 0 });
      expect(result[1].inbound).toBe(5);
    });

    it('devolve os pontos originais para faixa invalida (from > to)', () => {
      const points = [{ date: '2026-07-02', inbound: 5, outbound: 1 }];
      expect(fillMissingDays(points, '2026-07-10', '2026-07-01', zeroMessageFlowPoint)).toBe(points);
    });
  });

  describe('sumCostUsd (precisao decimal exata, sem float)', () => {
    it('soma custos preservando todas as 8 casas decimais', () => {
      const total = sumCostUsd([buildPoint({ costUsd: '0.00000001' }), buildPoint({ costUsd: '0.00000002' })]);
      expect(total).toBe('0.00000003');
    });

    it('soma valores que em float dariam erro de arredondamento', () => {
      const total = sumCostUsd([buildPoint({ costUsd: '0.10000000' }), buildPoint({ costUsd: '0.20000000' })]);
      expect(total).toBe('0.30000000');
    });

    it('lista vazia soma zero', () => {
      expect(sumCostUsd([])).toBe('0.00000000');
    });
  });

  describe('presetRange', () => {
    it('devolve from/to em YYYY-MM-DD UTC, incluindo o dia atual', () => {
      const now = new Date('2026-07-10T15:30:00.000Z');
      expect(presetRange(7, now)).toEqual({ from: '2026-07-04', to: '2026-07-10' });
    });
  });
});
