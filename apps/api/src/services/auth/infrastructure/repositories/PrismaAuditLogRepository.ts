import type { PrismaClient, Prisma } from '@prisma/client';

import { AuditLog } from '../../domain/entities/AuditLog';
import { AuditLogPage, AuditLogRepository, ListAuditLogsOptions, NewAuditLog } from '../../domain/repositories/AuditLogRepository';

interface AuditLogRow {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  occurredAt: Date;
}

function toDomain(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorUserId: row.actorUserId ?? undefined,
    action: row.action,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Implementacao Prisma de `AuditLogRepository` — Milestone 5, Bloco M5A.
 * Append-only (so `record`/`listByTenant`). Paginacao por cursor identica a
 * `PrismaConversationRepository.findAllByTenant` (Bloco 5/D11): `orderBy`
 * composto [occurredAt desc, id desc] para ordem deterministica, `take
 * limit+1` para detectar `hasMore`/`nextCursor` sem um segundo `count()`.
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: NewAuditLog): Promise<AuditLog> {
    const row = await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
    return toDomain(row);
  }

  async listByTenant(tenantId: string, options: ListAuditLogsOptions): Promise<AuditLogPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
        ...(options.action ? { action: options.action } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    const entries = page.map(toDomain);
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;

    return { entries, nextCursor };
  }
}
