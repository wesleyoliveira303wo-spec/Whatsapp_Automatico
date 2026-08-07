import { Tag, TagColor } from '../../../../src/services/tags/domain/entities/Tag';
import {
  TagRepository,
  TagInput,
} from '../../../../src/services/tags/domain/repositories/TagRepository';

/**
 * Fake em memória de `TagRepository` (Redesign 2026-08-05, R4) — mesmo papel
 * dos demais Fakes deste projeto: determinístico, sem banco. IDOR-safe por
 * construção (catálogo escopado por `(tenantId, sessionName)`).
 *
 * `assign`/`unassign` recebem um segundo mapa em memória simulando
 * `WhatsAppConversation` (`(id, tenantId, sessionName)`) — só o suficiente
 * para reproduzir as duas checagens reais do `PrismaTagRepository`: a
 * conversa pertence ao tenant, e a tag pertence à MESMA sessão da conversa.
 */
export class FakeTagRepository implements TagRepository {
  private readonly rows = new Map<string, Tag>();
  private readonly conversations = new Map<string, { tenantId: string; sessionName: string }>();
  private readonly assignments = new Set<string>();
  private nextId = 1;

  async listBySession(tenantId: string, sessionName: string): Promise<Tag[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId && row.sessionName === sessionName)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(tenantId: string, sessionName: string, name: string, color: TagColor): Promise<Tag> {
    const id = `tag-${this.nextId++}`;
    const now = new Date('2026-08-06T00:00:00.000Z');
    const row: Tag = { id, tenantId, sessionName, name, color, createdAt: now, updatedAt: now };
    this.rows.set(id, row);
    return row;
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    data: TagInput,
  ): Promise<Tag | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.tenantId !== tenantId || existing.sessionName !== sessionName) {
      return null;
    }
    const updated: Tag = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.color !== undefined && { color: data.color }),
      updatedAt: new Date('2026-08-06T01:00:00.000Z'),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async remove(tenantId: string, sessionName: string, id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing || existing.tenantId !== tenantId || existing.sessionName !== sessionName) {
      return false;
    }
    this.rows.delete(id);
    return true;
  }

  async assign(tenantId: string, conversationId: string, tagId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.tenantId !== tenantId) {
      return false;
    }
    const tag = this.rows.get(tagId);
    if (!tag || tag.tenantId !== tenantId || tag.sessionName !== conversation.sessionName) {
      return false;
    }
    this.assignments.add(`${conversationId}:${tagId}`);
    return true;
  }

  async unassign(tenantId: string, conversationId: string, tagId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.tenantId !== tenantId) {
      return false;
    }
    this.assignments.delete(`${conversationId}:${tagId}`);
    return true;
  }

  /** Helper de teste: pré-carrega uma tag, devolvendo o `id` gerado. */
  seed(tenantId: string, sessionName: string, name: string, color: TagColor = 'gray'): string {
    const id = `tag-${this.nextId++}`;
    const now = new Date('2026-08-06T00:00:00.000Z');
    this.rows.set(id, { id, tenantId, sessionName, name, color, createdAt: now, updatedAt: now });
    return id;
  }

  /** Helper de teste: pré-carrega uma conversa (só o suficiente para `assign`/`unassign`). */
  seedConversation(id: string, tenantId: string, sessionName: string): void {
    this.conversations.set(id, { tenantId, sessionName });
  }

  /** Helper de teste: verifica se uma atribuição existe. */
  isAssigned(conversationId: string, tagId: string): boolean {
    return this.assignments.has(`${conversationId}:${tagId}`);
  }
}
