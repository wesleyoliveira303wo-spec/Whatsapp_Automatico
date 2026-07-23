import { PrismaAuditLogRepository } from '../../../../src/services/auth/infrastructure/repositories/PrismaAuditLogRepository';
import type { PrismaClient } from '@prisma/client';

function buildRepo(): { repo: PrismaAuditLogRepository; auditLog: Record<string, jest.Mock> } {
  const auditLog = {
    create: jest.fn(),
    findMany: jest.fn(),
  } as unknown as Record<string, jest.Mock>;
  const prisma = { auditLog } as unknown as PrismaClient;
  return { repo: new PrismaAuditLogRepository(prisma), auditLog };
}

function row(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    tenantId: 'tenant-1',
    actorUserId: 'user-1',
    action: 'auth.login.success',
    targetType: null,
    targetId: null,
    metadata: null,
    ip: null,
    userAgent: null,
    occurredAt: new Date('2026-07-18T12:00:00Z'),
    ...over,
  };
}

describe('PrismaAuditLogRepository (Milestone 5, Bloco M5A)', () => {
  it('record grava o evento e preserva metadata; mapeia a linha de volta', async () => {
    const { repo, auditLog } = buildRepo();
    auditLog.create.mockResolvedValue(row('a-1', { metadata: { foo: 'bar' } }));

    const result = await repo.record({ tenantId: 'tenant-1', actorUserId: 'user-1', action: 'auth.login.success', metadata: { foo: 'bar' } });

    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'auth.login.success', metadata: { foo: 'bar' } }) }),
    );
    expect(result.metadata).toEqual({ foo: 'bar' });
  });

  it('listByTenant: sem exceder o limite, nao ha nextCursor', async () => {
    const { repo, auditLog } = buildRepo();
    auditLog.findMany.mockResolvedValue([row('a-1'), row('a-2')]);

    const page = await repo.listByTenant('tenant-1', { limit: 5 });

    expect(page.entries).toHaveLength(2);
    expect(page.nextCursor).toBeUndefined();
    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' }, take: 6 }),
    );
  });

  it('listByTenant: ao exceder o limite, corta e devolve nextCursor', async () => {
    const { repo, auditLog } = buildRepo();
    auditLog.findMany.mockResolvedValue([row('a-1'), row('a-2'), row('a-3')]);

    const page = await repo.listByTenant('tenant-1', { limit: 2 });

    expect(page.entries.map((e) => e.id)).toEqual(['a-1', 'a-2']);
    expect(page.nextCursor).toBe('a-2');
  });

  it('listByTenant: repassa filtros (ator/acao) e cursor/skip', async () => {
    const { repo, auditLog } = buildRepo();
    auditLog.findMany.mockResolvedValue([]);

    await repo.listByTenant('tenant-1', { actorUserId: 'user-9', action: 'user.role_changed', limit: 10, cursor: 'a-5' });

    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', actorUserId: 'user-9', action: 'user.role_changed' },
        cursor: { id: 'a-5' },
        skip: 1,
      }),
    );
  });
});
