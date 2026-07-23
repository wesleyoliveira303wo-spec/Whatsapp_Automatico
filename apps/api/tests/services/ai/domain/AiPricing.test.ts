import { AiModelPrice, calculateCostUsd } from '../../../../src/services/ai/domain/AiPricing';
import { AiProviderName } from '../../../../src/services/ai/domain/providers/AiProviderName';

const TEST_PRICING: Partial<Record<AiProviderName, Record<string, AiModelPrice>>> = {
  claude: {
    'test-model': { inputPerMillionUsd: 10, outputPerMillionUsd: 20 },
  },
};

describe('calculateCostUsd', () => {
  it('calcula o custo a partir dos tokens de entrada e saída usando a tabela informada', () => {
    const result = calculateCostUsd('claude', 'test-model', 1_000_000, 500_000, TEST_PRICING);

    // 1_000_000 tokens de entrada a $10/MTok + 500_000 de saída a $20/MTok = $10 + $10 = $20
    expect(result).toBe((20).toFixed(8));
  });

  it('devolve "0" quando model é undefined (caminho provider_error)', () => {
    const result = calculateCostUsd('claude', undefined, 100, 100, TEST_PRICING);

    expect(result).toBe('0');
  });

  it('devolve "0" quando o model não está registrado na tabela de preços', () => {
    const result = calculateCostUsd('claude', 'modelo-desconhecido', 1000, 1000, TEST_PRICING);

    expect(result).toBe('0');
  });

  it('devolve "0" quando o provider não está registrado na tabela de preços', () => {
    const result = calculateCostUsd('openai', 'test-model', 1000, 1000, TEST_PRICING);

    expect(result).toBe('0');
  });

  it('usa AI_PRICING (tabela real) como default quando nenhuma tabela é informada', () => {
    // claude-opus-4-8: $5/MTok entrada, $25/MTok saída (platform.claude.com/docs, consultado em 2026-07-10)
    const result = calculateCostUsd('claude', 'claude-opus-4-8', 1_000_000, 0);

    expect(result).toBe((5).toFixed(8));
  });

  it('devolve "0" com a tabela real (AI_PRICING) para um modelo não catalogado', () => {
    const result = calculateCostUsd('claude', 'claude-modelo-futuro-inexistente', 1000, 1000);

    expect(result).toBe('0');
  });

  it('calcula o custo do Gemini a partir da tabela real (AI_PRICING)', () => {
    // gemini-2.5-flash: $0.30/MTok entrada, $2.50/MTok saída.
    const result = calculateCostUsd('gemini', 'gemini-2.5-flash', 1_000_000, 1_000_000);

    // $0.30 + $2.50 = $2.80
    expect(result).toBe((2.8).toFixed(8));
  });
});
