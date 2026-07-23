import { AiInteraction } from '../../../../src/services/ai/domain/entities/AiInteraction';
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
  async listByConversation(tenantId: string, conversationId: string, limit: number): Promise<AiInteraction[]> {
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
}
