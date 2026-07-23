import type { PrismaClient } from '@prisma/client';

import { RefreshToken } from '../../domain/entities/RefreshToken';
import { NewRefreshToken, RefreshTokenRepository } from '../../domain/repositories/RefreshTokenRepository';

interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}

function toDomain(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined,
    createdAt: row.createdAt,
    userAgent: row.userAgent ?? undefined,
    ip: row.ip ?? undefined,
  };
}

/**
 * Implementacao Prisma de `RefreshTokenRepository` — Milestone 5, Bloco M5A.
 * So persistencia; rotacao/deteccao de reuso sao logica da Application (M5B).
 */
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewRefreshToken): Promise<RefreshToken> {
    const row = await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: input.revokedAt ?? null,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
      },
    });
    return toDomain(row);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async revokeById(id: string): Promise<void> {
    // `updateMany` (nao `update`): idempotente e nao lanca se o id nao existir.
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
