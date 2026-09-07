import type { PrismaClient, Prisma } from '@prisma/client';

import {
  PlatformAuditAction,
  PlatformAuditEntry,
} from '../../domain/entities/PlatformAuditEntry';
import {
  PlatformAuditLogRepository,
  PlatformAuditPage,
} from '../../domain/repositories/PlatformAuditLogRepository';

interface PlatformAuditLogRow {
  id: string;
  platformUserId: string;
  action: string;
  tenantId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  occurredAt: Date;
}

function toDomain(row: PlatformAuditLogRow): PlatformAuditEntry {
  return {
    id: row.id,
    platformUserId: row.platformUserId,
    // A coluna é texto livre de propósito (ação nova não deve exigir
    // migration numa tabela append-only). Uma linha antiga com ação hoje
    // desconhecida ainda precisa ser LIDA — a trilha existe para isso —,
    // então o cast preserva o valor em vez de descartar a linha.
    action: row.action as PlatformAuditAction,
    tenantId: row.tenantId ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementação Prisma de `PlatformAuditLogRepository` — append-only, sem
 * update nem delete, mesmo contrato de `PrismaAuditLogRepository`. A
 * paginação por cursor também é idêntica: `orderBy` composto
 * [occurredAt desc, id desc] para ordem determinística quando duas linhas
 * empatam no mesmo instante, e `take limit + 1` para descobrir se há próxima
 * página sem um segundo `count()`.
 */
export class PrismaPlatformAuditLogRepository implements PlatformAuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(entry: Omit<PlatformAuditEntry, 'id' | 'occurredAt'>): Promise<void> {
    await this.prisma.platformAuditLog.create({
      data: {
        platformUserId: entry.platformUserId,
        action: entry.action,
        tenantId: entry.tenantId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  async listRecent(limit: number, cursor?: string): Promise<PlatformAuditPage> {
    const rows = await this.prisma.platformAuditLog.findMany({
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }
}
