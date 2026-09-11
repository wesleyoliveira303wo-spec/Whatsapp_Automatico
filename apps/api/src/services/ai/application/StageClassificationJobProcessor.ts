import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { AiAvailabilityRepository } from '../../conversations/domain/repositories/AiAvailabilityRepository';
import { TenantPlanRepository } from '../../conversations/domain/repositories/TenantPlanRepository';
import { shouldAutoRespond } from '../../conversations/domain/policies/shouldAutoRespond';
import { shouldAiUpdateStage } from '../../conversations/domain/policies/shouldAiUpdateStage';
import { isLatestMessage } from '../../conversations/domain/policies/isLatestMessage';
import {
  DEFAULT_SESSION_GAP_MS,
  trimHistoryToCurrentSession,
} from '../../conversations/domain/policies/trimHistoryToCurrentSession';
import { planPermiteUso } from '../../../shared/tenant/domain/planPermiteUso';
import { Logger } from '../../../shared/domain/Logger';
import { AiInteractionRepository } from '../domain/repositories/AiInteractionRepository';
import { AiProvider, AiGenerationResult } from '../domain/providers/AiProvider';
import { AiProviderName } from '../domain/providers/AiProviderName';
import { calculateCostUsd } from '../domain/AiPricing';
import { extractStage } from '../domain/stageSignal';
import {
  STAGE_CLASSIFIER_PROMPT_VERSION,
  buildStageClassificationPrompt,
} from './StageClassificationPromptBuilder';

/** Menos que o autoresponder (20 + contexto): basta para ler o rumo da conversa. */
const DEFAULT_CLASSIFIER_HISTORY_LIMIT = 30;

export interface StageClassificationJobData {
  tenantId: string;
  conversationId: string;
  messageId: string;
}

export type StageClassificationOutcome =
  | 'updated'
  | 'unchanged'
  | 'skipped'
  | 'provider_error'
  | 'no_stage_in_reply';

/**
 * Classifica o estágio do Pipeline de uma conversa que a IA NÃO está
 * respondendo (2026-09-11, pedido do fundador: com a IA desligada por causa da
 * cota gratuita do Gemini, ele atende à mão e o Pipeline ficava parado).
 *
 * Portões, todos ANTES de gastar uma chamada de IA:
 * 1. conversa existe, é do tenant, e está no funil (`excludedFromPipeline`);
 * 2. o plano permite uso de IA;
 * 3. a IA não vai responder esta conversa sozinha — se vai, a resposta dela
 *    já classifica (marcador), e esta análise seria gasto dobrado;
 * 4. o job é da mensagem MAIS RECENTE da conversa (`isLatestMessage`) — numa
 *    troca de várias mensagens, só a última análise roda.
 *
 * A gravação segue a MESMA regra da IA que responde: nunca regride no funil
 * (ADR #89), exceto numa sessão nova depois de 24h de silêncio
 * (`trimHistoryToCurrentSession`). O arrastar humano continua livre.
 *
 * Falha do provider (ex.: cota 429) não relança: ninguém está esperando, a
 * próxima mensagem agenda outra análise. A tentativa fica registrada em
 * `AiInteraction` (custo e falha aparecem no Analytics e no `/admin`).
 */
export class StageClassificationJobProcessor {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly aiInteractionRepository: AiInteractionRepository,
    private readonly aiAvailabilityRepository: AiAvailabilityRepository,
    private readonly tenantPlanRepository: TenantPlanRepository,
    private readonly aiProvider: AiProvider,
    private readonly providerName: AiProviderName,
    private readonly logger: Logger,
    private readonly historyLimit: number = DEFAULT_CLASSIFIER_HISTORY_LIMIT,
    private readonly sessionGapMs: number = DEFAULT_SESSION_GAP_MS,
  ) {}

  async process(data: StageClassificationJobData): Promise<StageClassificationOutcome> {
    const { tenantId, conversationId, messageId } = data;

    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation || conversation.tenantId !== tenantId || conversation.excludedFromPipeline) {
      return 'skipped';
    }

    const planAllows = planPermiteUso(await this.tenantPlanRepository.getPlan(tenantId));
    if (!planAllows) {
      return 'skipped';
    }

    const aiEnabled = await this.aiAvailabilityRepository.isEnabled(
      tenantId,
      conversation.sessionName,
    );
    if (shouldAutoRespond(conversation, aiEnabled, planAllows)) {
      return 'skipped';
    }

    const recent = await this.messageRepository.listRecentByConversation(
      tenantId,
      conversationId,
      this.historyLimit,
    );
    if (!isLatestMessage(recent, messageId)) {
      return 'skipped';
    }

    const { messages, sessionRestarted } = trimHistoryToCurrentSession(
      [...recent].reverse(),
      this.sessionGapMs,
    );

    const request = buildStageClassificationPrompt(messages, conversation.stage);
    const startedAt = Date.now();

    let result: AiGenerationResult;
    try {
      result = await this.aiProvider.generateReply(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.aiInteractionRepository.record({
        tenantId,
        conversationId,
        provider: this.providerName,
        model: undefined,
        promptVersion: STAGE_CLASSIFIER_PROMPT_VERSION,
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: '0',
        latencyMs: Date.now() - startedAt,
        status: 'provider_error',
        errorMessage,
      });
      this.logger.warn('Falha ao classificar estágio da conversa via IA', {
        tenantId,
        conversationId,
        errorMessage,
      });
      return 'provider_error';
    }

    await this.aiInteractionRepository.record({
      tenantId,
      conversationId,
      provider: this.providerName,
      model: result.model,
      promptVersion: STAGE_CLASSIFIER_PROMPT_VERSION,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      costUsd: calculateCostUsd(
        this.providerName,
        result.model,
        result.tokensInput,
        result.tokensOutput,
      ),
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });

    const { stage } = extractStage(result.content);
    if (!stage) {
      this.logger.warn('Classificador de estágio respondeu sem marcador válido', {
        tenantId,
        conversationId,
        replyPreview: result.content.slice(0, 120),
      });
      return 'no_stage_in_reply';
    }

    if (stage === conversation.stage || !shouldAiUpdateStage(conversation, stage, sessionRestarted)) {
      return 'unchanged';
    }

    await this.conversationRepository.updateStage(tenantId, conversationId, stage, 'ai');
    this.logger.info('Estágio da conversa atualizado pelo classificador', {
      tenantId,
      conversationId,
      from: conversation.stage,
      to: stage,
    });
    return 'updated';
  }
}
