import { QuickReply } from '../../../../src/services/quickReplies/domain/entities/QuickReply';
import { QuickReplyRepository } from '../../../../src/services/quickReplies/domain/repositories/QuickReplyRepository';

/**
 * Fake em memória de `QuickReplyRepository` (Fase 1, Bloco F1.9) — mesmo
 * papel dos demais Fakes deste projeto: determinístico, sem banco. IDOR-safe
 * por construção, igual ao repositório Prisma real: `update`/`remove` só
 * afetam a linha se ela pertencer ao `(tenantId, sessionName)` informado.
 */
export class FakeQuickReplyRepository implements QuickReplyRepository {
  private readonly rows = new Map<string, QuickReply>();
  private nextId = 1;

  async listBySession(tenantId: string, sessionName: string): Promise<QuickReply[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId && row.sessionName === sessionName)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async create(tenantId: string, sessionName: string, content: string): Promise<QuickReply> {
    const id = `qr-${this.nextId++}`;
    const now = new Date('2026-08-05T00:00:00.000Z');
    const row: QuickReply = { id, tenantId, sessionName, content, createdAt: now, updatedAt: now };
    this.rows.set(id, row);
    return row;
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    content: string,
  ): Promise<QuickReply | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.tenantId !== tenantId || existing.sessionName !== sessionName) {
      return null;
    }
    const updated: QuickReply = {
      ...existing,
      content,
      updatedAt: new Date('2026-08-05T01:00:00.000Z'),
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

  /** Helper de teste: pré-carrega uma resposta rápida, devolvendo o `id` gerado. */
  seed(tenantId: string, sessionName: string, content: string): string {
    const id = `qr-${this.nextId++}`;
    const now = new Date('2026-08-05T00:00:00.000Z');
    this.rows.set(id, { id, tenantId, sessionName, content, createdAt: now, updatedAt: now });
    return id;
  }
}
