import { PrismaRefreshTokenRepository } from '../../../../src/services/auth/infrastructure/repositories/PrismaRefreshTokenRepository';
import type { PrismaClient } from '@prisma/client';

function buildRepo(): {
  repo: PrismaRefreshTokenRepository;
  refreshToken: Record<string, jest.Mock>;
} {
  const refreshToken = {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  } as unknown as Record<string, jest.Mock>;
  const prisma = { refreshToken } as unknown as PrismaClient;
  return { repo: new PrismaRefreshTokenRepository(prisma), refreshToken };
}

const ROW = {
  id: 'rt-1',
  userId: 'user-1',
  tokenHash: 'hash-abc',
  expiresAt: new Date('2026-08-01T00:00:00Z'),
  revokedAt: null,
  createdAt: new Date('2026-07-18T12:00:00Z'),
  userAgent: null,
  ip: null,
};

describe('PrismaRefreshTokenRepository (Milestone 5, Bloco M5A)', () => {
  it('create persiste o hash (nunca o token cru) e devolve a entidade', async () => {
    const { repo, refreshToken } = buildRepo();
    refreshToken.create.mockResolvedValue(ROW);

    const result = await repo.create({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: ROW.expiresAt,
    });

    expect(refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokenHash: 'hash-abc' }) }),
    );
    expect(result.tokenHash).toBe('hash-abc');
    expect(result.revokedAt).toBeUndefined();
  });

  it('findByTokenHash mapeia null e linha', async () => {
    const { repo, refreshToken } = buildRepo();
    refreshToken.findUnique.mockResolvedValueOnce(null);
    expect(await repo.findByTokenHash('x')).toBeNull();

    refreshToken.findUnique.mockResolvedValueOnce(ROW);
    const found = await repo.findByTokenHash('hash-abc');
    expect(found?.userId).toBe('user-1');
  });

  it('revokeById so revoga tokens ainda ativos (revokedAt = null)', async () => {
    const { repo, refreshToken } = buildRepo();
    refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await repo.revokeById('rt-1');

    expect(refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('revokeAllByUser revoga a familia inteira do usuario', async () => {
    const { repo, refreshToken } = buildRepo();
    refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await repo.revokeAllByUser('user-1');

    expect(refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
  });
});
