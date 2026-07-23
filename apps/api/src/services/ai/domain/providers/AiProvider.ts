/**
 * Requisição de geração de resposta, já pronta para qualquer `AiProvider` —
 * Milestone 3, Bloco 3a. Formato normalizado, independente de provider:
 * nenhum campo aqui é específico do Claude/Anthropic (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.2).
 */
export interface AiGenerationRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Resultado normalizado de uma geração de resposta — mesmo racional de
 * `AiGenerationRequest`: qualquer `AiProvider` (Claude, e no futuro
 * OpenAI/Gemini/etc.) devolve exatamente este formato, nunca o formato bruto
 * da respectiva SDK. É essa normalização que mantém `ConversationAiService`
 * (Bloco 3a) e o futuro worker (Bloco 4) sem nenhum conhecimento de
 * particularidades de cada provider (§2.3, risco "Consistência entre
 * múltiplos AiProvider no futuro").
 */
export interface AiGenerationResult {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
}

/**
 * Porta (port) de geração de resposta de IA — Milestone 3, Bloco 3a. Mesma
 * estrutura Ports & Adapters já usada para `WhatsAppProvider` (Item 5, Bloco
 * 2/ADR #34): um port pequeno, testável com um Fake
 * (`FakeAiProvider`, em `apps/api/tests/services/ai/infrastructure/`), sem
 * nenhum conhecimento de qual implementação concreta (`ClaudeAiProvider`,
 * hoje; `OpenAiProvider`/`GeminiProvider`, no futuro) está por trás dela.
 *
 * Só este arquivo e `ClaudeAiProvider.ts` (Infrastructure) sabem que
 * `AiGenerationRequest`/`AiGenerationResult` existem — nenhum SDK de
 * terceiros (Anthropic ou outro) é importado aqui.
 */
export interface AiProvider {
  generateReply(request: AiGenerationRequest): Promise<AiGenerationResult>;
}
