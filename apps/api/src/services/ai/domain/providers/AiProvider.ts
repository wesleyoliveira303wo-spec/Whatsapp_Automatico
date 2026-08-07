/**
 * Binário de mídia anexado a UMA mensagem do histórico (Fase 1, Bloco F1.2)
 * — permite que um `AiProvider` multimodal (hoje só o Gemini) "veja"/"ouça"
 * o conteúdo real de uma imagem/áudio, em vez de só ler a descrição factual
 * gerada por `PromptBuilder.describeMessageContent` (F1.1-6).
 *
 * `data` é o binário em BASE64 (não um `Buffer` — o formato que toda API de
 * IA multimodal conhecida, Gemini incluído, espera para `inlineData`/
 * `image_url`/similar). `mimeType` decide como o provider interpreta os
 * bytes (`image/jpeg`, `audio/ogg`, etc.).
 *
 * DELIBERADAMENTE não é anexado a TODO o histórico — só à mensagem mais
 * recente que tiver mídia (decisão de `ConversationAiService`, não deste
 * contrato): reenviar o binário de mídias antigas a cada chamada nova
 * multiplicaria custo e latência sem ganho real de qualidade (a análise da
 * Fase 1, seção F1.2, já registra isso como risco). Este contrato não
 * impõe esse limite — só permite que quem monta a requisição o aplique.
 */
export interface AiMediaContentPart {
  mimeType: string;
  data: string;
}

/**
 * Requisição de geração de resposta, já pronta para qualquer `AiProvider` —
 * Milestone 3, Bloco 3a. Formato normalizado, independente de provider:
 * nenhum campo aqui é específico do Claude/Anthropic (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.2).
 *
 * `media` (Fase 1, Bloco F1.2): OPCIONAL e aditivo — toda mensagem sempre
 * tem `content: string` (texto, ou a descrição factual de F1.1-6 quando não
 * há binário anexado), preservando 100% de compatibilidade com qualquer
 * `AiProvider` que não seja multimodal. Um provider sem suporte a `media`
 * (`ClaudeAiProvider`, hoje) simplesmente ignora o campo e usa só `content`
 * — degradação graciosa por design, nunca um erro.
 */
export interface AiGenerationRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; media?: AiMediaContentPart }>;
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
