import type { PrismaClient } from '@prisma/client';

import { AiFaqEntry } from '../../domain/entities/AiFaqEntry';
import { AiFaqEntryUpdateInput, AiFaqRepository } from '../../domain/repositories/AiFaqRepository';

/** Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma deste projeto. */
interface AiFaqEntryRow {
  id: string;
  tenantId: string;
  sessionName: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AiFaqEntryRow): AiFaqEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    question: row.question,
    answer: row.answer,
    category: row.category,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `AiFaqRepository` sobre o model `AiFaqEntry`
 * (`prisma/schema.prisma`, Cérebro da IA v3, Fase 2).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto). `update`/`remove` são IDOR-safe por construção:
 * `updateMany`/`deleteMany` com `where: { id, tenantId, sessionName }`.
 */
export class PrismaAiFaqRepository implements AiFaqRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    const rows = await this.prisma.aiFaqEntry.findMany({
      where: { tenantId, sessionName },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listActiveBySession(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    const rows = await this.prisma.aiFaqEntry.findMany({
      where: { tenantId, sessionName, active: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(
    tenantId: string,
    sessionName: string,
    question: string,
    answer: string,
    category: string | null,
  ): Promise<AiFaqEntry> {
    const row = await this.prisma.aiFaqEntry.create({
      data: { tenantId, sessionName, question, answer, category },
    });
    return toDomain(row);
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    input: AiFaqEntryUpdateInput,
  ): Promise<AiFaqEntry | null> {
    const { count } = await this.prisma.aiFaqEntry.updateMany({
      where: { id, tenantId, sessionName },
      data: input,
    });
    if (count === 0) {
      return null;
    }
    const row = await this.prisma.aiFaqEntry.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async remove(tenantId: string, sessionName: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.aiFaqEntry.deleteMany({
      where: { id, tenantId, sessionName },
    });
    return count > 0;
  }
}
