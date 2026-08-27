import { PrismaTenantRepository } from '../../../src/shared/tenant/infrastructure/PrismaTenantRepository';

/**
 * Fake mínimo do formato relevante do Prisma Client — mesmo padrão de
 * `PrismaCredentialsStore.test.ts`: cobre só o shape usado por esta classe
 * (`tenant.findUnique`).
 */
function createFakePrisma(): { tenant: { findUnique: jest.Mock; updateMany: jest.Mock } } {
  return { tenant: { findUnique: jest.fn(), updateMany: jest.fn() } };
}

describe('PrismaTenantRepository', () => {
  describe('findById', () => {
    it('deve retornar null quando o tenant não existe', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.findUnique.mockResolvedValue(null);
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.findById('tenant-inexistente');

      expect(result).toBeNull();
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-inexistente' },
      });
    });

    it('deve mapear a linha encontrada para a entidade Tenant (id, name, apiKeyHash)', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Empresa Teste',
        apiKeyHash: 'hash-abc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.findById('tenant-1');

      // Só os 3 campos da entidade reduzida — createdAt/updatedAt do banco
      // não devem vazar para o Domain (ver Tenant.ts).
      expect(result).toEqual({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-abc' });
    });

    it('deve mapear apiKeyHash null corretamente (tenant sem chave emitida)', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Empresa Teste',
        apiKeyHash: null,
      });
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.findById('tenant-1');

      expect(result?.apiKeyHash).toBeNull();
    });
  });

  describe('findByApiKeyHash', () => {
    it('deve retornar null quando nenhum tenant tem esse hash', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.findUnique.mockResolvedValue(null);
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.findByApiKeyHash('hash-desconhecido');

      expect(result).toBeNull();
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { apiKeyHash: 'hash-desconhecido' },
      });
    });

    it('deve retornar o tenant dono do hash', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Empresa Teste',
        apiKeyHash: 'hash-abc',
      });
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.findByApiKeyHash('hash-abc');

      expect(result).toEqual({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-abc' });
    });
  });

  // Reorganizacao Perfil/Configuracoes (2026-08-27) — aba "Empresa".
  describe('update', () => {
    it('atualiza o nome e devolve o tenant atualizado', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Novo Nome',
        apiKeyHash: null,
      });
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.update('tenant-1', { name: 'Novo Nome' });

      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { name: 'Novo Nome' },
      });
      expect(result).toEqual({ id: 'tenant-1', name: 'Novo Nome', apiKeyHash: null });
    });

    it('devolve undefined quando o tenant nao existe', async () => {
      const prisma = createFakePrisma();
      prisma.tenant.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaTenantRepository(prisma as never);

      const result = await repo.update('tenant-inexistente', { name: 'X' });

      expect(result).toBeUndefined();
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });
  });
});
