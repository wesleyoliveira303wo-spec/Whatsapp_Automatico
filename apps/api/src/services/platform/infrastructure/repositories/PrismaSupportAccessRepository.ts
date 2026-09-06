import type { PrismaClient, SupportAccessStatus as PrismaSupportAccessStatus } from '@prisma/client';

import {
  SupportAccessStatus,
  TenantAccessRequest,
} from '../../domain/entities/TenantAccessRequest';
import {
  SupportAccessPage,
  SupportAccessRepository,
} from '../../domain/repositories/SupportAccessRepository';
import {
  SupportAccessVerification,
  SupportAccessVerifier,
} from '../../domain/providers/SupportAccessVerifier';

const STATUS_TO_DOMAIN: Record<PrismaSupportAccessStatus, SupportAccessStatus> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DENIED: 'denied',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  ENDED: 'ended',
};

const STATUS_TO_PRISMA: Record<SupportAccessStatus, PrismaSupportAccessStatus> = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  denied: 'DENIED',
  expired: 'EXPIRED',
  revoked: 'REVOKED',
  ended: 'ENDED',
};

interface Row {
  id: string;
  tenantId: string;
  platformUserId: string;
  reason: string;
  status: PrismaSupportAccessStatus;
  requestedAt: Date;
  respondedAt: Date | null;
  respondedByUserId: string | null;
  expiresAt: Date | null;
}

function toDomain(row: Row): TenantAccessRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    platformUserId: row.platformUserId,
    reason: row.reason,
    status: STATUS_TO_DOMAIN[row.status],
    requestedAt: row.requestedAt,
    respondedAt: row.respondedAt,
    respondedByUserId: row.respondedByUserId,
    expiresAt: row.expiresAt,
  };
}

/**
 * Implementação Prisma do ciclo de acesso assistido (Fase 5). Também
 * implementa `SupportAccessVerifier` — a porta estreita que o `authenticate`
 * usa para revalidar o acesso no banco a cada requisição (Regra 1). Um único
 * objeto serve os dois papéis para não haver duas leituras divergentes do
 * mesmo `TenantAccessRequest`.
 */
export class PrismaSupportAccessRepository
  implements SupportAccessRepository, SupportAccessVerifier
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    tenantId: string;
    platformUserId: string;
    reason: string;
  }): Promise<TenantAccessRequest> {
    const row = await this.prisma.tenantAccessRequest.create({ data: input });
    return toDomain(row);
  }

  async findById(id: string): Promise<TenantAccessRequest | null> {
    const row = await this.prisma.tenantAccessRequest.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findActiveOrPendingByTenant(tenantId: string): Promise<TenantAccessRequest | null> {
    const now = new Date();
    const row = await this.prisma.tenantAccessRequest.findFirst({
      where: {
        tenantId,
        OR: [{ status: 'PENDING' }, { status: 'ACCEPTED', expiresAt: { gt: now } }],
      },
      orderBy: { requestedAt: 'desc' },
    });
    return row ? toDomain(row) : null;
  }

  async listByTenant(tenantId: string, limit: number): Promise<TenantAccessRequest[]> {
    const rows = await this.prisma.tenantAccessRequest.findMany({
      where: { tenantId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toDomain);
  }

  async listRecent(limit: number, cursor?: string): Promise<SupportAccessPage> {
    const rows = await this.prisma.tenantAccessRequest.findMany({
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      requests: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  async updateStatus(
    id: string,
    status: SupportAccessStatus,
    fields?: { respondedAt?: Date; respondedByUserId?: string; expiresAt?: Date },
  ): Promise<TenantAccessRequest | null> {
    const result = await this.prisma.tenantAccessRequest.updateMany({
      where: { id },
      data: {
        status: STATUS_TO_PRISMA[status],
        ...(fields?.respondedAt ? { respondedAt: fields.respondedAt } : {}),
        ...(fields?.respondedByUserId ? { respondedByUserId: fields.respondedByUserId } : {}),
        ...(fields?.expiresAt ? { expiresAt: fields.expiresAt } : {}),
      },
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
  }

  async markExpiredStale(now: Date): Promise<number> {
    const result = await this.prisma.tenantAccessRequest.updateMany({
      where: { status: 'ACCEPTED', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  /** `SupportAccessVerifier` — revalida no banco. Nunca lança. */
  async verify(supportAccessId: string): Promise<SupportAccessVerification> {
    let row: Row | null;
    try {
      row = await this.prisma.tenantAccessRequest.findUnique({
        where: { id: supportAccessId },
      });
    } catch {
      return { ok: false, reason: 'lookup_failed' };
    }
    if (!row) {
      return { ok: false, reason: 'not_found' };
    }
    const request = toDomain(row);
    if (request.status !== 'accepted') {
      return { ok: false, reason: request.status === 'pending' ? 'not_yet_accepted' : 'ended' };
    }
    if (request.expiresAt === null || request.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, tenantId: request.tenantId, platformUserId: request.platformUserId };
  }
}
