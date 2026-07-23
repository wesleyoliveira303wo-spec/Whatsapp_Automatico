import { PrismaAiBusinessProfileRepository } from '../../../../src/services/ai/infrastructure/repositories/PrismaAiBusinessProfileRepository';

function createFakePrisma(): { aiBusinessProfile: { findUnique: jest.Mock; upsert: jest.Mock } } {
  return {
    aiBusinessProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'profile-1',
  tenantId: 'tenant-1',
  content: 'Salão da Maria. Corte R$ 50.',
  createdAt: new Date('2026-07-22T00:00:00Z'),
  updatedAt: new Date('2026-07-22T10:00:00Z'),
};

describe('PrismaAiBusinessProfileRepository', () => {
  describe('findByTenant()', () => {
    it('busca por tenantId (unique) e mapeia a linha para o Domain (só tenantId/content/updatedAt)', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      const result = await repo.findByTenant('tenant-1');

      expect(prisma.aiBusinessProfile.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
      expect(result).toEqual({
        tenantId: 'tenant-1',
        content: 'Salão da Maria. Corte R$ 50.',
        updatedAt: SAMPLE_ROW.updatedAt,
      });
    });

    it('devolve null (não lança) quando o tenant não tem perfil', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.findUnique.mockResolvedValue(null);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      expect(await repo.findByTenant('tenant-sem-perfil')).toBeNull();
    });
  });

  describe('upsert()', () => {
    it('faz upsert por tenantId: create e update carregam o mesmo content', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      const result = await repo.upsert('tenant-1', 'Salão da Maria. Corte R$ 50.');

      expect(prisma.aiBusinessProfile.upsert).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        create: { tenantId: 'tenant-1', content: 'Salão da Maria. Corte R$ 50.' },
        update: { content: 'Salão da Maria. Corte R$ 50.' },
      });
      expect(result).toEqual({
        tenantId: 'tenant-1',
        content: 'Salão da Maria. Corte R$ 50.',
        updatedAt: SAMPLE_ROW.updatedAt,
      });
    });
  });
});
