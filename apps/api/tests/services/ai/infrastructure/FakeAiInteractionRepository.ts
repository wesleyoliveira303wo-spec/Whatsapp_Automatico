import { AiInteraction } from '../../../../src/services/ai/domain/entities/AiInteraction';
import { UnansweredQuestion } from '../../../../src/services/ai/domain/entities/UnansweredQuestion';
import { AiInteractionRepository } from '../../../../src/services/ai/domain/repositories/AiInteractionRepository';

/**
 * Fake de `AiInteractionRepository` (Milestone 3, Bloco 3b) — em memória,
 * sem Prisma/Postgres. Mesmo padrão de `FakeMessageRepository`
 * (`apps/api/tests/services/conversations/testDoubles.ts`): `record()` gera
 * `id`/`createdAt` como a implementação real faria, guarda tudo em memória
 * para inspeção pelos testes.
 */
export class FakeAiInteractionRepository implements AiInteractionRepository {
  private interactions: AiInteraction[] = [];
  private nextId = 1;

  public failNextRecord = false;
  public readonly linkMessageCalls: Array<{ interactionId: string; messageId: string }> = [];

  async record(interaction: Omit<AiInteraction, 'id' | 'createdAt'>): Promise<string> {
    if (this.failNextRecord) {
      this.failNextRecord = false;
      throw new Error('Falha simulada no AiInteractionRepository');
    }
    const id = `ai-interaction-${this.nextId++}`;
    this.interactions.push({ ...interaction, id, createdAt: new Date() });
    return id;
  }

  /**
   * Achado F2 (aprovado, preparação arquitetural): sem nenhum chamador de
   * produção ainda — presente aqui só para permitir testar o port
   * isoladamente.
   */
  async linkMessage(interactionId: string, messageId: string): Promise<void> {
    this.linkMessageCalls.push({ interactionId, messageId });
    const index = this.interactions.findIndex((interaction) => interaction.id === interactionId);
    if (index !== -1) {
      this.interactions[index] = { ...this.interactions[index], messageId };
    }
  }

  /** Helper de teste, não faz parte da interface de produção. */
  getAll(): ReadonlyArray<AiInteraction> {
    return this.interactions;
  }

  /** Milestone 3, Bloco 5 (D13 — aditivo). Espelha `PrismaAiInteractionRepository.listByConversation()`. */
  async listByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<AiInteraction[]> {
    return this.interactions
      .filter((i) => i.tenantId === tenantId && i.conversationId === conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /** Milestone 3, Bloco 5 (D13 — aditivo). Espelha `PrismaAiInteractionRepository.listByTenant()`. */
  async listByTenant(tenantId: string, limit: number): Promise<AiInteraction[]> {
    return this.interactions
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Contexto de conversa/mensagem que a implementação real resolve por JOIN
   * (Bloco B3). Um Fake em memória não tem as outras duas tabelas, então o
   * teste declara aqui o que aquele `conversationId` representa. Conversa
   * sem contexto declarado cai num default — assim os testes que não se
   * importam com sessão/pergunta seguem funcionando sem preâmbulo.
   */
  private readonly conversationContext = new Map<string, UnansweredQuestionContext>();

  /** Helper de teste, não faz parte da interface de produção. */
  seedConversationContext(conversationId: string, context: UnansweredQuestionContext): void {
    this.conversationContext.set(conversationId, context);
  }

  /**
   * Fase 1, Bloco F1.4 (2026-08-01 — aditivo); Bloco B3 (issue #14) passou a
   * devolver o read model `UnansweredQuestion`, filtrado por sessão.
   * Espelha `PrismaAiInteractionRepository.listUnansweredQuestions()`.
   */
  async listUnansweredQuestions(
    tenantId: string,
    sessionName: string,
    limit: number,
  ): Promise<UnansweredQuestion[]> {
    return this.interactions
      .filter(
        (i) =>
          i.tenantId === tenantId &&
          i.status === 'success' &&
          i.escalationReason === 'unknown_answer' &&
          this.contextFor(i.conversationId).sessionName === sessionName,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((interaction) => {
        const context = this.contextFor(interaction.conversationId);
        return {
          interactionId: interaction.id,
          conversationId: interaction.conversationId,
          sessionName: context.sessionName,
          questionText: interaction.messageId ? context.questionText : undefined,
          contactJid: context.contactJid ?? '5511999999999@s.whatsapp.net',
          contactName: context.contactName,
          savedContactName: context.savedContactName,
          occurredAt: interaction.createdAt,
        };
      });
  }

  private contextFor(conversationId: string): UnansweredQuestionContext {
    return this.conversationContext.get(conversationId) ?? { sessionName: DEFAULT_SESSION_NAME };
  }
}

/** Sessão assumida para conversas sem contexto declarado por `seedConversationContext`. */
export const DEFAULT_SESSION_NAME = 'sessao-de-teste';

export interface UnansweredQuestionContext {
  sessionName: string;
  questionText?: string;
  contactJid?: string;
  contactName?: string;
  savedContactName?: string;
}
