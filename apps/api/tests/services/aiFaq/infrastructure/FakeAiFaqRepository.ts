import { AiFaqEntry } from '../../../../src/services/aiFaq/domain/entities/AiFaqEntry';
import {
  AiFaqEntryUpdateInput,
  AiFaqRepository,
} from '../../../../src/services/aiFaq/domain/repositories/AiFaqRepository';

/**
 * Fake em memória de `AiFaqRepository` (Cérebro da IA v3, Fase 2) — mesmo
 * papel de `FakeQuickReplyRepository`: determinístico, sem banco. IDOR-safe
 * por construção, igual ao repositório Prisma real.
 */
export class FakeAiFaqRepository implements AiFaqRepository {
  private readonly rows = new Map<string, AiFaqEntry>();
  private nextId = 1;

  async listBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId && row.sessionName === sessionName)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listActiveBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    const all = await this.listBySession(tenantId, sessionName);
    return all.filter((row) => row.active);
  }

  async create(
    tenantId: string,
    sessionName: string,
    question: string,
    answer: string,
    category: string | null,
  ): Promise<AiFaqEntry> {
    const id = `faq-${this.nextId++}`;
    const now = new Date('2026-08-25T00:00:00.000Z');
    const row: AiFaqEntry = {
      id,
      tenantId,
      sessionName,
      question,
      answer,
      category,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, row);
    return row;
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    input: AiFaqEntryUpdateInput,
  ): Promise<AiFaqEntry | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.tenantId !== tenantId || existing.sessionName !== sessionName) {
      return null;
    }
    const updated: AiFaqEntry = {
      ...existing,
      ...input,
      updatedAt: new Date('2026-08-25T01:00:00.000Z'),
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

  /** Helper de teste: pré-carrega uma FAQ, devolvendo o `id` gerado. */
  seed(
    tenantId: string,
    sessionName: string,
    question: string,
    answer: string,
    options: { category?: string | null; active?: boolean } = {},
  ): string {
    const id = `faq-${this.nextId++}`;
    const now = new Date('2026-08-25T00:00:00.000Z');
    this.rows.set(id, {
      id,
      tenantId,
      sessionName,
      question,
      answer,
      category: options.category ?? null,
      active: options.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
}
