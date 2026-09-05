import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiInteraction } from '../domain/entities/AiInteraction';
import { UnansweredQuestion } from '../domain/entities/UnansweredQuestion';
import { AiInteractionRepository } from '../domain/repositories/AiInteractionRepository';

/** Milestone 3, Bloco 5 (D13) — default/teto de `listInteractions()`, mesmo padrão de `ConversationsService`. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListInteractionsOptions {
  conversationId?: string;
  limit?: number;
}

/**
 * Application Service que orquestra `GET .../ai-interactions` (Milestone 3,
 * Bloco 5 — D13 do levantamento arquitetural). Vive em `services/ai/`, não
 * em `services/conversations/` (D16: `AiInteraction` pertence ao bounded
 * context `ai`; um router de `conversations` importando este port cruzaria a
 * fronteira de Presentation entre bounded contexts, o que este projeto evita
 * em todo outro lugar).
 *
 * `conversationId` opcional na query (D13, resolvido pela Opção B do
 * levantamento): se informado, filtra por conversa específica
 * (`listByConversation`); se omitido, lista todas as interações do tenant
 * (`listByTenant`) — cobre as duas leituras possíveis da mesma rota sem
 * precisar de dois endpoints distintos.
 *
 * Deliberadamente NÃO depende de `ConversationRepository` para validar que
 * `conversationId` pertence a `tenantId`: `AiInteractionRepository.
 * listByConversation` já filtra por AMBOS na consulta (defesa em
 * profundidade, mesmo racional de `MessageRepository.
 * listRecentByConversation`) — um `conversationId` de outro tenant
 * simplesmente devolve lista vazia, sem precisar de uma dependência cruzada
 * entre bounded contexts só para essa checagem.
 */
export class AiInteractionsService {
  constructor(
    private readonly aiInteractionRepository: AiInteractionRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async listInteractions(
    tenantId: string,
    options: ListInteractionsOptions = {},
  ): Promise<AiInteraction[]> {
    await this.assertTenantExists(tenantId);
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    if (options.conversationId) {
      return this.aiInteractionRepository.listByConversation(
        tenantId,
        options.conversationId,
        limit,
      );
    }

    return this.aiInteractionRepository.listByTenant(tenantId, limit);
  }

  /**
   * Fase 1, Bloco F1.4 (2026-08-01) — critério de aceite: "uma consulta
   * simples já consegue listar as N perguntas mais recentes que a IA não
   * soube responder". Mesmo default/teto de `listInteractions`.
   */
  async listUnansweredQuestions(
    tenantId: string,
    sessionName: string,
    limit?: number,
  ): Promise<UnansweredQuestion[]> {
    await this.assertTenantExists(tenantId);
    const resolvedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.aiInteractionRepository.listUnansweredQuestions(
      tenantId,
      sessionName,
      resolvedLimit,
    );
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de ai-interactions recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
