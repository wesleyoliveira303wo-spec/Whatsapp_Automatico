import { PrismaTenantRepository } from '../../../src/shared/tenant/infrastructure/PrismaTenantRepository';

/**
 * Fake mínimo do formato relevante do Prisma Client — mesmo padrão de
 * `PrismaCredentialsStore.test.ts`: cobre só o shape usado por esta classe
 * (`tenant.findUnique`).
 */
function createFakePrisma(): { tenant: { findUnique: jest.Mock } } {
  return { tenant: { findUnique: jest.fn() } };
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
});
