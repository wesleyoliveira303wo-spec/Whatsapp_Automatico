import { PrismaTagRepository } from '../../../../src/services/tags/infrastructure/repositories/PrismaTagRepository';

function createFakePrisma(): {
  whatsAppTag: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  whatsAppConversation: { findFirst: jest.Mock };
  whatsAppConversationTag: { upsert: jest.Mock; deleteMany: jest.Mock };
} {
  return {
    whatsAppTag: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    whatsAppConversation: {
      findFirst: jest.fn(),
    },
    whatsAppConversationTag: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'tag-1',
  tenantId: 'tenant-1',
  sessionName: 'sessao-1',
  name: 'Urgente',
  color: 'RED',
  createdAt: new Date('2026-08-06T00:00:00Z'),
  updatedAt: new Date('2026-08-06T00:00:00Z'),
};

describe('PrismaTagRepository (Redesign 2026-08-05, R4)', () => {
  describe('listBySession()', () => {
    it('busca por (tenantId, sessionName), ordenado por name asc, e mapeia cor MAIÚSCULA para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.listBySession('tenant-1', 'sessao-1');

      expect(prisma.whatsAppTag.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'sessao-1' },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'tag-1',
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          name: 'Urgente',
          color: 'red',
          createdAt: SAMPLE_ROW.createdAt,
          updatedAt: SAMPLE_ROW.updatedAt,
        },
      ]);
    });
  });

  describe('create()', () => {
    it('cria com (tenantId, sessionName, name, color) traduzindo a cor para MAIÚSCULO', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.create('tenant-1', 'sessao-1', 'Urgente', 'red');

      expect(prisma.whatsAppTag.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', sessionName: 'sessao-1', name: 'Urgente', color: 'RED' },
      });
      expect(result.color).toBe('red');
    });
  });

  describe('update()', () => {
    it('atualiza via updateMany escopado por (id, tenantId, sessionName) e devolve a linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppTag.findUnique.mockResolvedValue({ ...SAMPLE_ROW, name: 'Nome novo' });
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'tag-1', { name: 'Nome novo' });

      expect(prisma.whatsAppTag.updateMany).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
        data: { name: 'Nome novo' },
      });
      expect(result?.name).toBe('Nome novo');
    });

    it('só inclui color no data quando informado, traduzido para MAIÚSCULO', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppTag.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaTagRepository(prisma as never);

      await repo.update('tenant-1', 'sessao-1', 'tag-1', { color: 'teal' });

      expect(prisma.whatsAppTag.updateMany).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
        data: { color: 'TEAL' },
      });
    });

    it('devolve null (IDOR-safe) quando updateMany não afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.update('tenant-1', 'sessao-1', 'tag-de-outro-tenant', {
        name: 'x',
      });

      expect(result).toBeNull();
      expect(prisma.whatsAppTag.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('remove via deleteMany escopado por (id, tenantId, sessionName) e devolve true', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.deleteMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.remove('tenant-1', 'sessao-1', 'tag-1');

      expect(prisma.whatsAppTag.deleteMany).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
      });
      expect(result).toBe(true);
    });

    it('devolve false (IDOR-safe) quando deleteMany não afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppTag.deleteMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaTagRepository(prisma as never);

      expect(await repo.remove('tenant-1', 'sessao-1', 'tag-de-outro-tenant')).toBe(false);
    });
  });

  describe('assign()', () => {
    it('atribui quando a conversa pertence ao tenant e a tag é da mesma sessão', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ sessionName: 'sessao-1' });
      prisma.whatsAppTag.findFirst.mockResolvedValue({ id: 'tag-1' });
      prisma.whatsAppConversationTag.upsert.mockResolvedValue({});
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.assign('tenant-1', 'conversation-1', 'tag-1');

      expect(prisma.whatsAppConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        select: { sessionName: true },
      });
      expect(prisma.whatsAppTag.findFirst).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId: 'tenant-1', sessionName: 'sessao-1' },
        select: { id: true },
      });
      expect(prisma.whatsAppConversationTag.upsert).toHaveBeenCalledWith({
        where: { conversationId_tagId: { conversationId: 'conversation-1', tagId: 'tag-1' } },
        create: { conversationId: 'conversation-1', tagId: 'tag-1' },
        update: {},
      });
      expect(result).toBe(true);
    });

    it('devolve false quando a conversa não pertence ao tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.assign('tenant-1', 'conversation-de-outro-tenant', 'tag-1');

      expect(result).toBe(false);
      expect(prisma.whatsAppTag.findFirst).not.toHaveBeenCalled();
      expect(prisma.whatsAppConversationTag.upsert).not.toHaveBeenCalled();
    });

    it('devolve false quando a tag não existe/não é da mesma sessão da conversa', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ sessionName: 'sessao-1' });
      prisma.whatsAppTag.findFirst.mockResolvedValue(null);
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.assign('tenant-1', 'conversation-1', 'tag-de-outra-sessao');

      expect(result).toBe(false);
      expect(prisma.whatsAppConversationTag.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unassign()', () => {
    it('remove a atribuição quando a conversa pertence ao tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.unassign('tenant-1', 'conversation-1', 'tag-1');

      expect(prisma.whatsAppConversationTag.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: 'conversation-1', tagId: 'tag-1' },
      });
      expect(result).toBe(true);
    });

    it('devolve false quando a conversa não pertence ao tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
      const repo = new PrismaTagRepository(prisma as never);

      const result = await repo.unassign('tenant-1', 'conversation-de-outro-tenant', 'tag-1');

      expect(result).toBe(false);
      expect(prisma.whatsAppConversationTag.deleteMany).not.toHaveBeenCalled();
    });
  });
});
