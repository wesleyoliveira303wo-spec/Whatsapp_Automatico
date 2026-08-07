import {
  AiProvider,
  AiGenerationRequest,
  AiGenerationResult,
} from '../domain/providers/AiProvider';
import { Logger } from '../../../shared/domain/Logger';

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

/**
 * Status HTTP considerados TRANSITÓRIOS (retry pode ajudar) — descoberto no
 * teste real de 23/07/2026: `503 UNAVAILABLE` ("This model is currently
 * experiencing high demand... usually temporary") escalou uma conversa para
 * humano numa mensagem tão simples quanto "Olá", quando uma segunda tentativa
 * alguns segundos depois provavelmente teria funcionado. Deliberadamente NÃO
 * inclui `429` (cota diária esgotada — retry em segundos não resolve nada,
 * só atrasa o aviso ao cliente) nem `404`/`401`/outros 4xx (erro de
 * configuração — modelo errado, chave inválida —, permanente até uma correção
 * humana; insistir só desperdiça tempo e uma tentativa a mais de cota).
 */
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Nº de tentativas EXTRAS (além da primeira) para erros transitórios.
 *
 * REVISADO 2026-07-31 (Fase 1, Bloco F1.2, validação real): o default
 * original (1 tentativa, 2s fixos — decisão de 23/07/2026) foi dimensionado
 * para um 503 isolado e breve. Na validação real do F1.2, uma onda de `503
 * UNAVAILABLE` mais persistente do lado do Google derrotou esse orçamento em
 * 4 conversas seguidas (1ª tentativa falha, espera 2s, 2ª tentativa falha
 * também, desiste e escala para humano). Subido para 3 tentativas extras
 * (4 no total) com espera CRESCENTE (backoff exponencial simples, não fixo)
 * — dá mais tempo para uma instabilidade um pouco mais longa se resolver,
 * sem deixar o cliente esperando indefinidamente (pior caso agora: ~2s + 4s +
 * 8s = 14s de espera antes de desistir e escalar, ainda dentro do que um
 * cliente tolera num chat).
 */
const DEFAULT_MAX_RETRIES = 3;

/** Espera ANTES da 1ª retentativa — default 2s, dobra a cada tentativa seguinte (backoff exponencial). */
const DEFAULT_RETRY_DELAY_MS = 2000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Opções de retry — agrupadas num único objeto (não mais 3 parâmetros
 * posicionais soltos) porque o construtor já tinha 5 parâmetros posicionais;
 * mesmo racional já aplicado à refatoração de `AiProviderFactoryImpl` para
 * options-object (evitar empilhar parâmetros posicionais sem nome). Todos
 * opcionais — quem constrói sem informar nada usa os defaults recomendados.
 */
export interface GeminiRetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** Injetável só para testes (evita esperas reais) — default: `setTimeout` de verdade. */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Erro interno usado para diferenciar, dentro do `catch` de `generateReply()`,
 * uma resposta HTTP não-2xx (`retryable` = o status está em
 * `RETRYABLE_STATUS_CODES`) de qualquer OUTRA exceção (o próprio `fetchFn`
 * lançando — falha de rede, timeout, DNS etc., que É retryable por natureza:
 * blips de rede são transitórios quase por definição). Nunca escapa deste
 * arquivo — quem chama `generateReply()` só vê o `Error` padrão de sempre
 * (mesma mensagem `"Gemini API respondeu <status>: <corpo>"` de antes desta
 * mudança, zero diferença de contrato para `ConversationAiService`).
 */
class GeminiHttpError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Formato bruto (parcial) da resposta REST `generateContent` do Gemini. */
interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  /**
   * CORREÇÃO 2026-07-30 (achado real: card do Pipeline nunca saía de "Novo"
   * mesmo com o prompt já reforçado com exemplos) — motivo pelo qual o
   * modelo parou de gerar tokens. `"MAX_TOKENS"` significa que a resposta foi
   * CORTADA por atingir `maxOutputTokens` antes de terminar — como o
   * marcador de estágio/escalonamento fica sempre no FINAL do texto (por
   * instrução do prompt), é a primeira coisa perdida num corte, e antes
   * desta correção isso era 100% silencioso (nem chegava a um log).
   */
  finishReason?: string;
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /**
   * Tokens gastos em "pensamento" interno do modelo (recurso "thinking",
   * ligado por padrão em modelos como `gemini-3.5-flash`) — INVISÍVEIS no
   * texto de resposta, mas consomem o MESMO orçamento de `maxOutputTokens`
   * que o texto visível. Não usado para lógica (só logging), mas exposto
   * aqui para poder aparecer no diagnóstico de um `MAX_TOKENS`.
   */
  thoughtsTokenCount?: number;
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
 * RETRY (adicionado 23/07/2026, achado do teste real — ver `GeminiHttpError`/
 * `RETRYABLE_STATUS_CODES` acima): diferente da decisão original de "sem
 * retry aqui, é responsabilidade do BullMQ" — essa decisão não cobria este
 * caso, porque `ConversationAiService` CAPTURA a exceção do provider e a
 * transforma num resultado `'provider_error'` (nunca relança), então o job
 * `ai-reply` nunca falha do ponto de vista do BullMQ; não há re-entrega a
 * esperar. Por isso uma tentativa extra para erros claramente TRANSITÓRIOS
 * (5xx do servidor, falha de rede do próprio `fetchFn`) foi movida para
 * DENTRO deste adapter — é o único lugar que sabe distinguir "vale a pena
 * tentar de novo" (503 de sobrecarga) de "não adianta" (429 de cota diária,
 * 404 de modelo inexistente, 401 de chave inválida). Uma resposta HTTP
 * não-2xx SEM retry restante (ou não retryable) ainda vira a MESMA exceção de
 * sempre (`"Gemini API respondeu <status>: <corpo>"`) — zero mudança de
 * contrato para `ConversationAiService`.
 */
export class GeminiAiProvider implements AiProvider {
  private readonly maxRetries: number;

  private readonly retryDelayMs: number;

  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number = DEFAULT_MAX_TOKENS,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl: string = GEMINI_API_BASE_URL,
    retryOptions: GeminiRetryOptions = {},
    // CORREÇÃO 2026-07-30 (achado real: card do Pipeline nunca saía de
    // "Novo" — ver `finishReason`/`thoughtsTokenCount` acima): `Logger`
    // OPCIONAL, 7º parâmetro — mesmo racional de manter compatibilidade
    // total já usado em toda a cadeia de refatorações deste arquivo
    // (`retryOptions` também é opcional). Sem logger, o provider funciona
    // exatamente como antes (silencioso); com logger, loga um `warn`
    // quando a resposta é cortada por `MAX_TOKENS`.
    private readonly logger?: Logger,
  ) {
    this.maxRetries = retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = retryOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.sleepFn = retryOptions.sleepFn ?? defaultSleep;
  }

  async generateReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const body = {
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: request.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        // Fase 1, Bloco F1.2: quando a mensagem carrega `media` (imagem/áudio
        // já baixado e codificado em base64 por `ConversationAiService`), um
        // segundo `part` do tipo `inline_data` é adicionado ao lado do texto
        // — o Gemini aceita múltiplos `parts` heterogêneos por `content`, e
        // processa o binário nativamente (visão/áudio), sem exigir upload
        // prévio via File API (dispensável para arquivos pequenos como os do
        // WhatsApp). `text` continua presente mesmo com mídia — é a legenda
        // (ou a descrição factual, se algo impedir o download) do
        // `PromptBuilder`, nunca substituída.
        parts: message.media
          ? [
              { text: message.content },
              { inline_data: { mime_type: message.media.mimeType, data: message.media.data } },
            ]
          : [{ text: message.content }],
      })),
      // NOTA (2026-07-31): uma tentativa anterior desligou o "thinking" do
      // Gemini aqui (`thinkingConfig: { thinkingBudget: 0 }`), na hipótese de
      // que os tokens invisíveis de raciocínio estivessem estourando o
      // `maxOutputTokens` e cortando o marcador de estágio do final da
      // resposta. A hipótese foi REFUTADA por evidência direta do banco: a
      // causa real do bug era outra (conversas travadas em
      // `stageSetBy: 'human'` por um arrastar-e-soltar anterior, ver ADR #87).
      // Revertido por decisão do fundador — o raciocínio interno volta ao
      // padrão do modelo, preservando a qualidade das respostas. O risco de
      // truncamento continua existindo em tese, mas agora é OBSERVÁVEL: o log
      // de `finishReason === 'MAX_TOKENS'` (abaixo) avisa se acontecer.
      generationConfig: { maxOutputTokens: this.maxTokens },
    };

    // eslint-disable-next-line no-constant-condition
    for (let attempt = 0; ; attempt += 1) {
      const isLastAttempt = attempt >= this.maxRetries;
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw new GeminiHttpError(
            `Gemini API respondeu ${response.status}: ${errorBody}`,
            RETRYABLE_STATUS_CODES.has(response.status),
          );
        }

        const data = (await response.json()) as GeminiGenerateContentResponse;
        const content = (data.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? '')
          .join('');

        // CORREÇÃO 2026-07-30: `finishReason === 'MAX_TOKENS'` significa que
        // a resposta foi CORTADA antes de terminar — o texto em `content`
        // pode estar incompleto, e qualquer marcador esperado no final
        // (estágio/escalonamento) pode ter se perdido. Antes desta correção,
        // isso não gerava nenhum log; agora fica visível no terminal da API
        // para diagnosticar sem precisar reproduzir o bug de novo.
        if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          this.logger?.warn(
            'Resposta do Gemini cortada por MAX_TOKENS — texto pode estar incompleto e marcadores finais podem ter se perdido',
            {
              model: this.model,
              maxTokens: this.maxTokens,
              tokensOutput: data.usageMetadata?.candidatesTokenCount,
              thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount,
              contentLength: content.length,
            },
          );
        }

        return {
          content,
          model: data.modelVersion ?? this.model,
          tokensInput: data.usageMetadata?.promptTokenCount ?? 0,
          tokensOutput: data.usageMetadata?.candidatesTokenCount ?? 0,
        };
      } catch (error) {
        // GeminiHttpError carrega se o STATUS é retryable (5xx). Qualquer
        // OUTRA exceção (o `fetchFn` lançando direto — falha de rede, timeout,
        // DNS) é tratada como retryable por padrão: um blip de rede é
        // transitório quase por definição.
        const retryable = error instanceof GeminiHttpError ? error.retryable : true;
        if (retryable && !isLastAttempt) {
          // Backoff exponencial (2026-07-31): 2s, 4s, 8s... — dobra a cada
          // tentativa (`attempt` começa em 0), em vez da espera fixa
          // original. Mesmo motivo do aumento de `DEFAULT_MAX_RETRIES` acima:
          // uma instabilidade mais longa do provider tem mais chance de se
          // resolver sozinha sem esperar o dobro do tempo logo na 1ª retry.
          const delayMs = this.retryDelayMs * 2 ** attempt;
          this.logger?.warn('Gemini respondeu erro transitório, tentando de novo', {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            delayMs,
          });
          await this.sleepFn(delayMs);
          continue;
        }
        throw error;
      }
    }
  }
}
