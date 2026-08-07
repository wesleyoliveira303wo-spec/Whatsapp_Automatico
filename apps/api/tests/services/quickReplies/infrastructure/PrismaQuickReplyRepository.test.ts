import { PrismaQuickReplyRepository } from '../../../../src/services/quickReplies/infrastructure/repositories/PrismaQuickReplyRepository';

function createFakePrisma(): {
  quickReply: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
  };
} {
  return {
    quickReply: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'qr-1',
  tenantId: 'tenant-1',
  sessionName: 'sessao-1',
  content: 'Bom dia! Como posso ajudar?',
  createdAt: new Date('2026-08-05T00:00:00Z'),
  updatedAt: new Date('2026-08-05T00:00:00Z'),
};

describe('PrismaQuickReplyRepository (Fase 1, Bloco F1.9)', () => {
  describe('listBySession()', () => {
    it('busca por (tenantId, sessionName), ordenado por createdAt asc, e mapeia para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaQuickReplyRepository(prisma as never);

      const result = await repo.listBySession('tenant-1', 'sessao-1');

      expect(prisma.quickReply.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'sessao-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'qr-1',
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          content: 'Bom dia! Como posso ajudar?',
          createdAt: SAMPLE_ROW.createdAt,
          updatedAt: SAMPLE_ROW.updatedAt,
        },
      ]);
    });
  });

  describe('create()', () => {
    it('cria com (tenantId, sessionName, content) e mapeia o resultado', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaQuickReplyRepository(prisma as never);

      const result = await repo.create('tenant-1', 'sessao-1', 'Bom dia! Como posso ajudar?');

      expect(prisma.quickReply.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          content: 'Bom dia! Como posso ajudar?',
        },
      });
      expect(result.id).toBe('qr-1');
    });
  });

  describe('update()', () => {
    it('atualiza via updateMany escopado por (id, tenantId, sessionName) e devolve a linha', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.updateMany.mockResolvedValue({ count: 1 });
      prisma.quickReply.findUnique.mockResolvedValue({ ...SAMPLE_ROW, content: 'Texto novo' });
      const repo = new PrismaQuickReplyRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'qr-1', 'Texto novo');

      expect(prisma.quickReply.updateMany).toHaveBeenCalledWith({
        where: { id: 'qr-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
        data: { content: 'Texto novo' },
      });
      expect(result?.content).toBe('Texto novo');
    });

    it('devolve null (IDOR-safe) quando updateMany não afeta nenhuma linha (id de outro tenant/sessão)', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaQuickReplyRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'qr-de-outro-tenant', 'x');

      expect(result).toBeNull();
      expect(prisma.quickReply.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('remove via deleteMany escopado por (id, tenantId, sessionName) e devolve true', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.deleteMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaQuickReplyRepository(prisma as never);

      const result = await repo.remove('tenant-1', 'sessao-1', 'qr-1');

      expect(prisma.quickReply.deleteMany).toHaveBeenCalledWith({
        where: { id: 'qr-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
      });
      expect(result).toBe(true);
    });

    it('devolve false (IDOR-safe) quando deleteMany não afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.quickReply.deleteMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaQuickReplyRepository(prisma as never);

      expect(await repo.remove('tenant-1', 'sessao-1', 'qr-de-outro-tenant')).toBe(false);
    });
  });
});
