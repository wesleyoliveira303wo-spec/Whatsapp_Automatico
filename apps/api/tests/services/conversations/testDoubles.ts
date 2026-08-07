import { Conversation } from '../../../src/services/conversations/domain/entities/Conversation';
import {
  ConversationRepository,
  FindAllByTenantOptions,
  ConversationPage,
  UpdateConversationStatusOptions,
} from '../../../src/services/conversations/domain/repositories/ConversationRepository';
import { Message } from '../../../src/services/conversations/domain/entities/Message';
import { MessageRepository } from '../../../src/services/conversations/domain/repositories/MessageRepository';
import { AiReplyScheduler } from '../../../src/services/conversations/domain/schedulers/AiReplyScheduler';

/**
 * Fake compartilhado do `ConversationRepository` (Milestone 3, Bloco 2) — em
 * memória, sem Prisma/Postgres. Mesmo padrão de
 * `FakeWhatsAppSessionRepository.upsertByTenantAndSessionName`
 * (`apps/api/tests/services/whatsapp/testDoubles.ts`): busca por chave
 * lógica (aqui, `tenantId`+`sessionName`+`contactJid`) e só atualiza
 * `updatedAt` se já existir — nenhum outro campo de negócio muda neste
 * método (ver docstring de `ConversationRepository`).
 */
export class FakeConversationRepository implements ConversationRepository {
  private conversations = new Map<string, Conversation>();

  async upsertByTenantSessionAndContact(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    create: Conversation,
  ): Promise<Conversation> {
    const existing = Array.from(this.conversations.values()).find(
      (c) =>
        c.tenantId === tenantId && c.sessionName === sessionName && c.contactJid === contactJid,
    );
    if (existing) {
      // Milestone 6, Bloco M6H-2b: espelha `PrismaConversationRepository` —
      // `contactName` só é atualizado quando a mensagem trouxe um (nunca
      // apaga um nome já salvo por falta de nome numa mensagem posterior).
      const updated: Conversation = {
        ...existing,
        updatedAt: create.updatedAt,
        ...(create.contactName ? { contactName: create.contactName } : {}),
      };
      this.conversations.set(existing.id, updated);
      return updated;
    }
    this.conversations.set(create.id, create);
    return create;
  }

  /**
   * Milestone 3, Bloco 4 (aditivo). Espelha
   * `PrismaConversationRepository.findById()`: devolve `undefined` (não
   * lança) se não existir.
   */
  async findById(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  /**
   * Milestone 3, Bloco 5 (D10 — aditivo). Espelha
   * `PrismaConversationRepository.updateStatus()`: `undefined` se não
   * existir OU não pertencer a `tenantId` (defesa em profundidade).
   */
  async updateStatus(
    tenantId: string,
    conversationId: string,
    status: Conversation['status'],
    options?: UpdateConversationStatusOptions,
  ): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = { ...existing, status };
    // Ownership (M5D/D57): só mexe no dono quando informado (`string` define,
    // `null` limpa); ausente = não altera.
    if (options && 'assignedToUserId' in options) {
      updated.assignedToUserId = options.assignedToUserId ?? undefined;
    }
    // Reforma do escalonamento (2026-07-25): mesmo padrão — só `null` é
    // aceito (limpa); ausente não mexe.
    if (options && 'escalatedAt' in options) {
      updated.escalatedAt = undefined;
    }
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /**
   * Reforma do escalonamento (2026-07-25). Espelha
   * `PrismaConversationRepository.flagNeedsHumanAttention()`: sempre
   * reescreve `escalatedAt`, mesmo se a conversa já estava sinalizada.
   */
  async flagNeedsHumanAttention(
    tenantId: string,
    conversationId: string,
    at: Date,
  ): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = { ...existing, escalatedAt: at };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /**
   * Indicador de não lidas (2026-07-25). Espelha
   * `PrismaConversationRepository.incrementUnreadCount()`: incrementa em +1,
   * não-op silencioso se a conversa não existir/não pertencer ao tenant.
   */
  async incrementUnreadCount(tenantId: string, conversationId: string): Promise<void> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return;
    }
    this.conversations.set(conversationId, { ...existing, unreadCount: existing.unreadCount + 1 });
  }

  /**
   * Indicador de não lidas (2026-07-25). Espelha
   * `PrismaConversationRepository.markAsRead()`: zera incondicionalmente.
   * `updatedAt` preservado por construção (spread não o toca) — a fake nunca
   * teve o bug corrigido em 2026-07-26 (bump automático de `updatedAt` via
   * `@updatedAt` do Prisma real em TODO update), porque ela não tem esse
   * comportamento automático.
   */
  async markAsRead(tenantId: string, conversationId: string): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = { ...existing, unreadCount: 0 };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /**
   * Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30). Espelha
   * `PrismaConversationRepository.updateStage()`: `undefined` se não
   * existir/não pertencer ao tenant; sempre reescreve `stage`/`stageSetBy`/
   * `stageUpdatedAt` (não é condicional a `shouldAiUpdateStage` — a policy é
   * checada por quem chama, não pelo repositório).
   */
  async updateStage(
    tenantId: string,
    conversationId: string,
    stage: Conversation['stage'],
    setBy: Conversation['stageSetBy'],
  ): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = {
      ...existing,
      stage,
      stageSetBy: setBy,
      stageUpdatedAt: new Date(),
    };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /**
   * Milestone 3, Bloco 5 (D11 — aditivo). Espelha
   * `PrismaConversationRepository.findAllByTenant()`: mesma ordenação
   * (`createdAt` DESC, `id` DESC como desempate) e mesma semântica de
   * cursor (`cursor` = `id` do último item da página anterior).
   */
  async findAllByTenant(
    tenantId: string,
    options: FindAllByTenantOptions,
  ): Promise<ConversationPage> {
    const { status, limit, cursor, sessionName, needsHumanAttention, excludedFromPipeline } =
      options;

    let filtered = Array.from(this.conversations.values())
      .filter((c) => c.tenantId === tenantId)
      .filter((c) => !status || c.status === status)
      .filter((c) => !sessionName || c.sessionName === sessionName)
      .filter((c) => !needsHumanAttention || c.escalatedAt !== undefined)
      // ADR #94 (2026-08-01) — espelha `PrismaConversationRepository`: só
      // filtra quando informado (`undefined` = sem filtro).
      .filter(
        (c) =>
          excludedFromPipeline === undefined || c.excludedFromPipeline === excludedFromPipeline,
      )
      // Ordenação por `updatedAt` (não `createdAt`) desde 2026-07-25 — espelha
      // `PrismaConversationRepository.findAllByTenant` (ver docstring lá).
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));

    if (cursor) {
      const cursorIndex = filtered.findIndex((c) => c.id === cursor);
      filtered = cursorIndex === -1 ? [] : filtered.slice(cursorIndex + 1);
    }

    const hasMore = filtered.length > limit;
    const page = filtered.slice(0, limit);

    return {
      conversations: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
    };
  }

  /**
   * ADR #94 (2026-08-01). Espelha `PrismaConversationRepository.
   * setExcludedFromPipeline()`: `undefined` se não existir/não pertencer ao
   * tenant.
   */
  async setExcludedFromPipeline(
    tenantId: string,
    conversationId: string,
    excluded: boolean,
  ): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = { ...existing, excludedFromPipeline: excluded };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /**
   * Redesign 2026-08-05 (R5). Espelha `PrismaConversationRepository.
   * updateAiSummary()`: `undefined` se não existir/não pertencer ao tenant.
   */
  async updateAiSummary(
    tenantId: string,
    conversationId: string,
    summary: string,
    messageCount: number,
  ): Promise<Conversation | undefined> {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      return undefined;
    }
    const updated: Conversation = {
      ...existing,
      aiSummary: summary,
      aiSummaryMessageCount: messageCount,
      aiSummaryUpdatedAt: new Date(),
    };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  /** Helper de teste: pré-popula uma conversa (ex.: já escalonada a humano). Não faz parte da interface de produção. */
  seed(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  /** Helper de teste, não faz parte da interface de produção. */
  getAll(): ReadonlyArray<Conversation> {
    return Array.from(this.conversations.values());
  }
}

/**
 * Fake compartilhado do `MessageRepository` (Milestone 3, Bloco 2) — em
 * memória. `create()` gera um `id` sequencial simples (não precisa ser um
 * UUID de verdade para os testes), mesmo padrão de
 * `FakeWhatsAppSessionEventRepository.append`.
 */
export class FakeMessageRepository implements MessageRepository {
  private messages: Message[] = [];
  private nextId = 1;

  async create(message: Omit<Message, 'id'>): Promise<Message> {
    const created: Message = { ...message, id: `message-${this.nextId++}` };
    this.messages.push(created);
    return created;
  }

  /**
   * Fase 1, Bloco F1.1 (ADR #90, aditivo). Espelha
   * `PrismaMessageRepository.findById()`: filtra por `tenantId`+`id`.
   */
  async findById(tenantId: string, messageId: string): Promise<Message | undefined> {
    return this.messages.find((m) => m.tenantId === tenantId && m.id === messageId);
  }

  /**
   * Milestone 3, Bloco 4 (aditivo). Espelha
   * `PrismaMessageRepository.listRecentByConversation()`: filtra por
   * `tenantId`+`conversationId`, ordena do mais novo para o mais antigo,
   * limita a `limit`.
   */
  async listRecentByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<Message[]> {
    return this.messages
      .filter((m) => m.tenantId === tenantId && m.conversationId === conversationId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }

  /** Helper de teste, não faz parte da interface de produção. */
  getAll(): ReadonlyArray<Message> {
    return this.messages;
  }
}

/**
 * Fake compartilhado do `AiReplyScheduler` (Milestone 3, Bloco 2) — é
 * exatamente o "Fake/no-op" que `MILESTONE_003_AI_AUTORESPONDER.md` (Bloco
 * 2) descreve como suficiente para os testes; não existe (nem deveria
 * existir, ver docstring do port) nenhuma implementação de produção ainda.
 * `failNextSchedule` permite provar que `MessageIngestionService` NÃO
 * engole uma falha desta porta (diferente de `SessionManager`, que loga
 * falhas de `MessageReceivedHandler` — aqui a falha deve propagar para quem
 * chamou `handle()`, que é exatamente o `SessionManager` já testado no
 * Bloco 1).
 */
export class FakeAiReplyScheduler implements AiReplyScheduler {
  public readonly scheduleCalls: Array<{
    tenantId: string;
    conversationId: string;
    messageId: string;
  }> = [];

  public failNextSchedule = false;

  async schedule(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    if (this.failNextSchedule) {
      this.failNextSchedule = false;
      throw new Error('Falha simulada no AiReplyScheduler');
    }
    this.scheduleCalls.push({ tenantId, conversationId, messageId });
  }
}
