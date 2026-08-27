import { PrismaAiFaqRepository } from '../../../../src/services/aiFaq/infrastructure/repositories/PrismaAiFaqRepository';

function createFakePrisma(): {
  aiFaqEntry: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
  };
} {
  return {
    aiFaqEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'faq-1',
  tenantId: 'tenant-1',
  sessionName: 'sessao-1',
  question: 'Qual o preço?',
  answer: 'R$ 990',
  category: 'Preços',
  active: true,
  createdAt: new Date('2026-08-25T00:00:00Z'),
  updatedAt: new Date('2026-08-25T00:00:00Z'),
};

describe('PrismaAiFaqRepository (Cérebro da IA v3, Fase 2)', () => {
  describe('listBySession()', () => {
    it('busca TODAS (ativas e inativas) por (tenantId, sessionName), ordenado por createdAt asc', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaAiFaqRepository(prisma as never);

      const result = await repo.listBySession('tenant-1', 'sessao-1');

      expect(prisma.aiFaqEntry.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'sessao-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'faq-1',
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          question: 'Qual o preço?',
          answer: 'R$ 990',
          category: 'Preços',
          active: true,
          createdAt: SAMPLE_ROW.createdAt,
          updatedAt: SAMPLE_ROW.updatedAt,
        },
      ]);
    });
  });

  describe('listActiveBySession()', () => {
    it('filtra por active: true, além de (tenantId, sessionName)', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaAiFaqRepository(prisma as never);

      await repo.listActiveBySession('tenant-1', 'sessao-1');

      expect(prisma.aiFaqEntry.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'sessao-1', active: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('create()', () => {
    it('cria com (tenantId, sessionName, question, answer, category) e mapeia o resultado', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaAiFaqRepository(prisma as never);

      const result = await repo.create('tenant-1', 'sessao-1', 'Qual o preço?', 'R$ 990', 'Preços');

      expect(prisma.aiFaqEntry.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          question: 'Qual o preço?',
          answer: 'R$ 990',
          category: 'Preços',
        },
      });
      expect(result.id).toBe('faq-1');
    });
  });

  describe('update()', () => {
    it('atualiza via updateMany escopado por (id, tenantId, sessionName) e devolve a linha', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiFaqEntry.findUnique.mockResolvedValue({ ...SAMPLE_ROW, active: false });
      const repo = new PrismaAiFaqRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'faq-1', { active: false });

      expect(prisma.aiFaqEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'faq-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
        data: { active: false },
      });
      expect(result?.active).toBe(false);
    });

    it('devolve null (IDOR-safe) quando updateMany não afeta nenhuma linha (id de outro tenant/sessão)', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaAiFaqRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'faq-de-outro-tenant', {
        active: false,
      });

      expect(result).toBeNull();
      expect(prisma.aiFaqEntry.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('remove via deleteMany escopado por (id, tenantId, sessionName) e devolve true', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.deleteMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaAiFaqRepository(prisma as never);

      const result = await repo.remove('tenant-1', 'sessao-1', 'faq-1');

      expect(prisma.aiFaqEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: 'faq-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
      });
      expect(result).toBe(true);
    });

    it('devolve false (IDOR-safe) quando deleteMany não afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.aiFaqEntry.deleteMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaAiFaqRepository(prisma as never);

      expect(await repo.remove('tenant-1', 'sessao-1', 'faq-de-outro-tenant')).toBe(false);
    });
  });
});
