import { AiProviderName } from './providers/AiProviderName';

/**
 * Preço por milhão de tokens (USD) de um modelo específico — Milestone 3,
 * Bloco 3b (Decisão B1 do levantamento arquitetural: registro estático em
 * código, mesmo padrão de `PromptVersion.ts`/`PROMPT_VERSIONS`).
 */
export interface AiModelPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

/**
 * Registro estático de preços por provider+model — Milestone 3, Bloco 3b.
 *
 * Valores conferidos em `https://platform.claude.com/docs/en/about-claude/pricing`
 * (consultado em 2026-07-10, preço "Base Input Tokens"/"Output Tokens" da
 * tabela oficial — sem cache/batch/fast-mode) — FATO, não estimativa, mas
 * sujeito a mudar sem aviso (é preço de mercado, não uma decisão deste
 * projeto). `claude-sonnet-5` está em preço promocional até 2026-08-31 (US$
 * 2/US$ 10 por MTok); sobe para US$ 3/US$ 15 em 2026-09-01 — este arquivo
 * NÃO automatiza essa transição (nenhuma lógica de data), fica registrado
 * aqui como um lembrete explícito de revisão manual necessária a partir
 * daquela data.
 *
 * Chave: a STRING EXATA de `model` devolvida por `AiGenerationResult.model`
 * (id real de modelo da API — ex.: `'claude-sonnet-5'`, `'claude-opus-4-8'`,
 * `'claude-haiku-4-5-20251001'`; ver
 * `https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions`),
 * não o alias que `ClaudeAiProvider` recebeu no construtor. Um `model` sem
 * entrada aqui (modelo novo ainda não catalogado, ou outro provider) não
 * impede o registro da interação nem a resposta ao usuário — só resulta em
 * `costUsd: '0'` (ver `calculateCostUsd`). Tabela cresce por edição direta
 * (PR/code review), nunca em runtime — mesmo espírito de `PROMPT_VERSIONS`.
 */
export const AI_PRICING: Partial<Record<AiProviderName, Record<string, AiModelPrice>>> = {
  claude: {
    'claude-opus-4-8': { inputPerMillionUsd: 5, outputPerMillionUsd: 25 },
    'claude-sonnet-5': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
    'claude-sonnet-4-6': { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
    'claude-haiku-4-5-20251001': { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
  },
  // Preços do Gemini (paid tier), por MTok — consultados em 2026-07-22 em fontes
  // de mercado (ver Memória do Projeto §18, entrada da M6). FATO sujeito a mudar
  // sem aviso, mesmo racional da tabela do Claude. Chave = a string `model` que
  // `GeminiAiProvider` devolve (campo `modelVersion` da resposta, ex.:
  // `'gemini-2.5-flash'`). Um `model` sem entrada aqui apenas resulta em
  // `costUsd: '0'` (ver `calculateCostUsd`) — nunca bloqueia a resposta.
  // NOTA: no FREE TIER do Google AI Studio o custo real é US$ 0; estes valores
  // servem para estimar o custo caso/quando migrar para o tier pago.
  gemini: {
    'gemini-2.5-flash-lite': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
    'gemini-2.5-flash': { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
    'gemini-2.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
  },
};

/**
 * Calcula o custo em USD de uma chamada de IA a partir dos tokens
 * consumidos — Milestone 3, Bloco 3b. Função pura de Domain, mesmo padrão de
 * `validateReply()`: NUNCA lança exceção — um preço desconhecido é um
 * caminho ESPERADO (modelo novo, provider sem tabela ainda), não uma
 * condição excepcional.
 *
 * Deliberadamente diferente do racional usado em
 * `AiProviderNotSupportedError`/`PromptVersionNotFoundError` (achado F2 da
 * auditoria do Bloco 3a, que lançam erro para configuração inválida): ali, a
 * dependência é BLOQUEANTE (sem provider/prompt válido não há como gerar
 * resposta nenhuma); aqui, o preço é uma dependência AUXILIAR de billing —
 * nunca deveria impedir a resposta ao usuário nem o registro de auditoria só
 * porque a tabela de preços está desatualizada. `'0'` é o sinal implícito de
 * lacuna de configuração a corrigir (sem um Logger dedicado neste bloco —
 * fora do escopo aprovado do Bloco 3b).
 *
 * `pricingTable` é injetável (default `AI_PRICING`) para permitir testar o
 * cálculo com preços fixos, sem depender dos valores reais (que mudam sem
 * aviso e não deveriam quebrar teste nenhum).
 */
export function calculateCostUsd(
  provider: AiProviderName,
  model: string | undefined,
  tokensInput: number,
  tokensOutput: number,
  pricingTable: Partial<Record<AiProviderName, Record<string, AiModelPrice>>> = AI_PRICING,
): string {
  if (!model) {
    return '0';
  }

  const price = pricingTable[provider]?.[model];
  if (!price) {
    return '0';
  }

  const cost = (tokensInput / 1_000_000) * price.inputPerMillionUsd + (tokensOutput / 1_000_000) * price.outputPerMillionUsd;
  return cost.toFixed(8);
}
