import type { PrismaClient } from '@prisma/client';

import { QuickReply } from '../../domain/entities/QuickReply';
import { QuickReplyRepository } from '../../domain/repositories/QuickReplyRepository';

/** Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma deste projeto. */
interface QuickReplyRow {
  id: string;
  tenantId: string;
  sessionName: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: QuickReplyRow): QuickReply {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `QuickReplyRepository` sobre o model `QuickReply`
 * (`prisma/schema.prisma`, Fase 1 — F1.9).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto) — o `ts-jest` erasa o import inteiro em transpilação
 * (`isolatedModules`), sem disparar `require('@prisma/client')` em runtime.
 *
 * `update`/`remove` são IDOR-safe por construção: usam `updateMany`/
 * `deleteMany` com `where: { id, tenantId, sessionName }` em vez de
 * `update`/`delete` por `id` isolado — um `id` que existe mas pertence a
 * outro tenant/sessão simplesmente não casa com o `where` (`count === 0`),
 * nunca lança nem afeta a linha errada.
 *
 * NOTA DE VERIFICAÇÃO: depende de `npx prisma generate` + `npx prisma
 * migrate dev` após a migration `20260805120000_add_quick_replies` ser
 * aplicada na máquina do fundador.
 */
export class PrismaQuickReplyRepository implements QuickReplyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(tenantId: string, sessionName: string): Promise<QuickReply[]> {
    const rows = await this.prisma.quickReply.findMany({
      where: { tenantId, sessionName },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(tenantId: string, sessionName: string, content: string): Promise<QuickReply> {
    const row = await this.prisma.quickReply.create({
      data: { tenantId, sessionName, content },
    });
    return toDomain(row);
  }

  async update(
    tenantId: string,
    sessionName: string,
    id: string,
    content: string,
  ): Promise<QuickReply | null> {
    const { count } = await this.prisma.quickReply.updateMany({
      where: { id, tenantId, sessionName },
      data: { content },
    });
    if (count === 0) {
      return null;
    }
    const row = await this.prisma.quickReply.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async remove(tenantId: string, sessionName: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.quickReply.deleteMany({
      where: { id, tenantId, sessionName },
    });
    return count > 0;
  }
}
