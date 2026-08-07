import { Conversation } from '../../conversations/domain/entities/Conversation';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { ConversationNotFoundError } from '../../conversations/domain/errors/ConversationNotFoundError';
import { ConversationSummaryUnavailableError } from '../domain/errors/ConversationSummaryUnavailableError';
import { AiInteractionRepository } from '../domain/repositories/AiInteractionRepository';
import { AiProvider, AiGenerationResult } from '../domain/providers/AiProvider';
import { AiProviderName } from '../domain/providers/AiProviderName';
import { calculateCostUsd } from '../domain/AiPricing';
import { buildSummaryPrompt } from './SummaryPromptBuilder';
import { Logger } from '../../../shared/domain/Logger';

/** Quantas mensagens (mais recentes) entram no resumo — mais generoso que `DEFAULT_HISTORY_LIMIT` (20) do autoresponder, já que este é um resumo sob demanda, não uma chamada por resposta. */
const DEFAULT_SUMMARY_HISTORY_LIMIT = 50;

/** `promptVersion` fixo — o resumo não tem variações de versão como `PromptVersion` (autoresponder); só um identificador estável para auditoria em `AiInteraction`. */
const SUMMARY_PROMPT_VERSION = 'summary-v1';

/**
 * Orquestra a geração do resumo de UMA conversa pela IA, sob demanda
 * (Redesign 2026-08-05, R5). Vive em `services/ai` (não em
 * `services/conversations`) porque depende de um `AiProvider` — mesmo
 * racional já estabelecido no projeto de que `services/ai` conhece as
 * entidades/repositórios de `services/conversations` (o worker de IA já lê
 * `Conversation`/`Message` de lá), nunca o inverso.
 *
 * Fluxo de `generateSummary()`:
 * 1. Busca a conversa por `id` e confirma que pertence ao `tenantId`
 *    (`ConversationNotFoundError` — mesmo idioma de `ConversationsService`).
 * 2. Busca até `DEFAULT_SUMMARY_HISTORY_LIMIT` mensagens mais recentes,
 *    invertidas para ordem cronológica (mesmo padrão de
 *    `AiReplyJobProcessor`). Sem NENHUMA mensagem, lança
 *    `ConversationSummaryUnavailableError` — não há o que resumir.
 * 3. Constrói o prompt via `buildSummaryPrompt` (dedicado, NÃO
 *    `PromptBuilder` do autoresponder).
 * 4. Chama `AiProvider.generateReply()` — falha do provider é registrada
 *    como `AiInteraction` (`status: 'provider_error'`) e PROPAGADA (o
 *    endpoint síncrono devolve erro ao operador, que pode tentar de novo —
 *    diferente do autoresponder, aqui não há cliente esperando em silêncio).
 * 5. Em sucesso, persiste via `ConversationRepository.updateAiSummary` e
 *    grava `AiInteraction` (`status: 'success'`).
 *
 * `aiProvider` é OPCIONAL (mesmo padrão de `ConversationsService.
 * mediaSender`/`outboundMessageDispatcher`) — `apps/api` (processo HTTP)
 * só o configura quando as credenciais do provider escolhido estão
 * presentes no `.env`; sem isso, `generateSummary()` lança um erro simples
 * e claro em vez de a aplicação inteira recusar subir.
 */
export class ConversationSummaryService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly aiInteractionRepository: AiInteractionRepository,
    private readonly providerName: AiProviderName,
    private readonly logger: Logger,
    private readonly aiProvider?: AiProvider,
    private readonly historyLimit: number = DEFAULT_SUMMARY_HISTORY_LIMIT,
  ) {}

  async generateSummary(tenantId: string, conversationId: string): Promise<Conversation> {
    if (!this.aiProvider) {
      throw new Error(
        'AiProvider não configurado para gerar resumos (ver AI_PROVIDER/CLAUDE_API_KEY/GEMINI_API_KEY no .env).',
      );
    }

    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation || conversation.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }

    const recent = await this.messageRepository.listRecentByConversation(
      tenantId,
      conversationId,
      this.historyLimit,
    );
    if (recent.length === 0) {
      throw new ConversationSummaryUnavailableError(conversationId);
    }
    const chronological = [...recent].reverse();

    const request = buildSummaryPrompt(chronological);
    const startedAt = Date.now();

    let result: AiGenerationResult;
    try {
      result = await this.aiProvider.generateReply(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const latencyMs = Date.now() - startedAt;
      await this.aiInteractionRepository.record({
        tenantId,
        conversationId,
        provider: this.providerName,
        model: undefined,
        promptVersion: SUMMARY_PROMPT_VERSION,
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: '0',
        latencyMs,
        status: 'provider_error',
        errorMessage,
      });
      this.logger.warn('Falha ao gerar resumo de conversa via IA', {
        tenantId,
        conversationId,
        errorMessage,
      });
      throw error;
    }

    const latencyMs = Date.now() - startedAt;
    const costUsd = calculateCostUsd(
      this.providerName,
      result.model,
      result.tokensInput,
      result.tokensOutput,
    );
    await this.aiInteractionRepository.record({
      tenantId,
      conversationId,
      provider: this.providerName,
      model: result.model,
      promptVersion: SUMMARY_PROMPT_VERSION,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      costUsd,
      latencyMs,
      status: 'success',
    });

    const updated = await this.conversationRepository.updateAiSummary(
      tenantId,
      conversationId,
      result.content,
      chronological.length,
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    return updated;
  }
}
