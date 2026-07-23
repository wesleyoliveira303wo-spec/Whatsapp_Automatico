import { PrismaUserRepository } from '../../../../src/services/auth/infrastructure/repositories/PrismaUserRepository';
import type { PrismaClient } from '@prisma/client';

/**
 * Testes de `PrismaUserRepository` (Milestone 5, Bloco M5A) com o Prisma
 * MOCKADO — sem Postgres. Verificam: mapeamento uniao-literal <-> enum,
 * mapeamento linha -> entidade, e a semantica de `update` (updateMany +
 * findById, devolvendo `undefined` quando nao existe).
 */
function buildRepo(overrides: Record<string, unknown> = {}): { repo: PrismaUserRepository; user: Record<string, jest.Mock> } {
  const user = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    ...overrides,
  } as unknown as Record<string, jest.Mock>;
  const prisma = { user } as unknown as PrismaClient;
  return { repo: new PrismaUserRepository(prisma), user };
}

const ROW = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'joao@empresa.com',
  passwordHash: 'hash',
  role: 'OPERATOR',
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: new Date('2026-07-18T12:00:00Z'),
  updatedAt: new Date('2026-07-18T12:00:00Z'),
};

describe('PrismaUserRepository (Milestone 5, Bloco M5A)', () => {
  it('create mapeia role/status (uniao -> enum) no data e devolve a entidade de Domain', async () => {
    const { repo, user } = buildRepo();
    user.create.mockResolvedValue({ ...ROW, role: 'ADMINISTRATOR', status: 'ACTIVE' });

    const result = await repo.create({
      tenantId: 'tenant-1',
      email: 'joao@empresa.com',
      passwordHash: 'hash',
      role: 'administrator',
      status: 'active',
    });

    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ADMINISTRATOR', status: 'ACTIVE' }) }),
    );
    expect(result.role).toBe('administrator');
    expect(result.status).toBe('active');
  });

  it('findById devolve null quando nao existe; mapeia a linha quando existe', async () => {
    const { repo, user } = buildRepo();
    user.findUnique.mockResolvedValueOnce(null);
    expect(await repo.findById('nope')).toBeNull();

    user.findUnique.mockResolvedValueOnce(ROW);
    const found = await repo.findById('user-1');
    expect(found?.role).toBe('operator');
    expect(found?.lastLoginAt).toBeUndefined();
  });

  it('findByTenantAndEmail usa a chave composta tenantId_email', async () => {
    const { repo, user } = buildRepo();
    user.findUnique.mockResolvedValue(ROW);

    await repo.findByTenantAndEmail('tenant-1', 'joao@empresa.com');

    expect(user.findUnique).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: 'tenant-1', email: 'joao@empresa.com' } },
    });
  });

  it('update devolve undefined quando updateMany nao afeta nenhuma linha', async () => {
    const { repo, user } = buildRepo();
    user.updateMany.mockResolvedValue({ count: 0 });

    expect(await repo.update('nope', { status: 'suspended' })).toBeUndefined();
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it('update mapeia role (uniao -> enum) e devolve a entidade atualizada quando existe', async () => {
    const { repo, user } = buildRepo();
    user.updateMany.mockResolvedValue({ count: 1 });
    user.findUnique.mockResolvedValue({ ...ROW, role: 'MANAGER' });

    const result = await repo.update('user-1', { role: 'manager' });

    expect(user.updateMany).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: expect.objectContaining({ role: 'MANAGER' }) });
    expect(result?.role).toBe('manager');
  });
});

describe('PrismaUserRepository — senha provisoria + listagem (Milestone 5, Bloco M5E)', () => {
  it('create grava mustChangePassword: false quando o campo nao e informado', async () => {
    const { repo, user } = buildRepo();
    user.create.mockResolvedValue(ROW);

    await repo.create({ tenantId: 'tenant-1', email: 'a@b.com', passwordHash: 'h', role: 'operator', status: 'active' });

    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: false }) }),
    );
  });

  it('create propaga mustChangePassword: true (senha provisoria de convite)', async () => {
    const { repo, user } = buildRepo();
    user.create.mockResolvedValue({ ...ROW, mustChangePassword: true });

    const result = await repo.create({
      tenantId: 'tenant-1',
      email: 'a@b.com',
      passwordHash: 'h',
      role: 'operator',
      status: 'active',
      mustChangePassword: true,
    });

    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: true }) }),
    );
    expect(result.mustChangePassword).toBe(true);
  });

  it('linha antiga (sem a coluna) e lida como mustChangePassword: false — compatibilidade', async () => {
    const { repo, user } = buildRepo();
    user.findUnique.mockResolvedValue(ROW); // ROW nao tem o campo

    const found = await repo.findById('user-1');

    expect(found?.mustChangePassword).toBe(false);
  });

  it('update repassa mustChangePassword: false (usuario trocou a senha)', async () => {
    const { repo, user } = buildRepo();
    user.updateMany.mockResolvedValue({ count: 1 });
    user.findUnique.mockResolvedValue(ROW);

    await repo.update('user-1', { passwordHash: 'novo', mustChangePassword: false });

    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ passwordHash: 'novo', mustChangePassword: false }),
    });
  });

  it('listByTenant filtra pelo tenant, ordena por createdAt desc e le limit + 1', async () => {
    const { repo, user } = buildRepo();
    user.findMany.mockResolvedValue([ROW, { ...ROW, id: 'user-2' }]);

    const page = await repo.listByTenant('tenant-1', { limit: 2 });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
    expect(page.users).toHaveLength(2);
    expect(page.nextCursor).toBeUndefined();
  });

  it('listByTenant devolve nextCursor quando ha mais paginas (linha extra descartada)', async () => {
    const { repo, user } = buildRepo();
    user.findMany.mockResolvedValue([ROW, { ...ROW, id: 'user-2' }, { ...ROW, id: 'user-3' }]);

    const page = await repo.listByTenant('tenant-1', { limit: 2 });

    expect(page.users.map((u) => u.id)).toEqual(['user-1', 'user-2']);
    expect(page.nextCursor).toBe('user-2');
  });

  it('listByTenant traduz os filtros status/role para os enums do Prisma', async () => {
    const { repo, user } = buildRepo();
    user.findMany.mockResolvedValue([]);

    await repo.listByTenant('tenant-1', { limit: 10, status: 'suspended', role: 'manager', cursor: 'user-9' });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', status: 'SUSPENDED', role: 'MANAGER' },
        cursor: { id: 'user-9' },
        skip: 1,
      }),
    );
  });
});
