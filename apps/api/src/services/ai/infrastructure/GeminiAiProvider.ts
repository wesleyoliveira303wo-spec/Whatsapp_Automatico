import { AiProvider, AiGenerationRequest, AiGenerationResult } from '../domain/providers/AiProvider';

/**
 * Valor DEFAULT de `maxTokens` quando o construtor não recebe um explícito —
 * mesmo racional (e mesmo número) de `DEFAULT_MAX_TOKENS` em
 * `ClaudeAiProvider.ts`: respostas de WhatsApp tendem a ser curtas; deve ser
 * revisto com dados reais antes de produção. Fica como default do parâmetro do
 * construtor, sobrescrevível sem editar este arquivo.
 */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Base URL da API Generative Language do Google (Gemini), versão `v1beta` — a
 * mesma que serve os modelos do free tier do Google AI Studio. Injetável pelo
 * construtor só para testes (apontar para um servidor falso); em produção nunca
 * muda.
 */
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Formato bruto (parcial) da resposta REST `generateContent` do Gemini. */
interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}
interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/**
 * Único arquivo deste projeto que conhece a API do Gemini (Google Generative
 * Language) — segundo `AiProvider` concreto do projeto, ao lado de
 * `ClaudeAiProvider`. Implementa o port `AiProvider` (Domain) traduzindo
 * `AiGenerationRequest`/`AiGenerationResult` (formato normalizado, independente
 * de provider) de e para o formato REST `generateContent` do Gemini.
 *
 * POR QUE REST (`fetch`) E NÃO UMA SDK (diferente de `ClaudeAiProvider`, que usa
 * `@anthropic-ai/sdk`):
 * - Zero dependência nova — mesma filosofia já adotada no projeto para o
 *   `PasswordHasher` (scrypt nativo) e o rate limiter (in-memory, sem lib). O
 *   endpoint `generateContent` é pequeno e estável; não justifica arrastar uma
 *   SDK e sua árvore de dependências só para uma chamada HTTP.
 * - Testabilidade: `fetchFn` é injetável (default: `fetch` global do Node 20+),
 *   então o teste substitui a função por um `jest.fn()` — sem `jest.mock` de
 *   módulo, mais simples que o mock da SDK usado em `ClaudeAiProvider.test.ts`.
 * - A fronteira de arquitetura fica preservada: só este arquivo sabe do formato
 *   do Gemini; `ConversationAiService`, `PromptBuilder` e o worker continuam
 *   cegos a qualquer particularidade de provider.
 *
 * DUAS DIFERENÇAS DE FORMATO frente ao Claude, tratadas aqui e em nenhum outro
 * lugar:
 * 1. Papéis: o Gemini usa `'user'`/`'model'` (não `'user'`/`'assistant'`). O
 *    mapeamento `assistant -> model` acontece só neste adapter.
 * 2. Autenticação: a chave vai no header `x-goog-api-key`, NÃO no query param
 *    `?key=` — evita a chave vazar em logs de acesso/URLs.
 *
 * `model` é OBRIGATÓRIO no construtor (sem default), mesmo racional de
 * `ClaudeAiProvider`: o identificador exato muda com o tempo e hardcodar
 * arriscaria fixar um valor desatualizado. Vem da configuração
 * (`AI_GEMINI_MODEL`), resolvida pelo composition root (`worker.ts`).
 *
 * Sem retry/timeout aqui (mesma decisão do `ClaudeAiProvider`): retry é
 * responsabilidade do BullMQ. Uma resposta HTTP não-2xx vira uma exceção com o
 * status e o corpo do erro no texto — quem chama (`ConversationAiService`) já
 * sabe convertê-la num resultado `'provider_error'`, e a mensagem descritiva
 * ajuda a diagnosticar (chave inválida, modelo inexistente, cota estourada).
 */
export class GeminiAiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number = DEFAULT_MAX_TOKENS,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl: string = GEMINI_API_BASE_URL,
  ) {}

  async generateReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const body = {
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: request.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: { maxOutputTokens: this.maxTokens },
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gemini API respondeu ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;

    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    return {
      content,
      model: data.modelVersion ?? this.model,
      tokensInput: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOutput: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
