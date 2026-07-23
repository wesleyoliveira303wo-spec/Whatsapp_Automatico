import { PrismaConversationRepository } from '../../../../src/services/conversations/infrastructure/repositories/PrismaConversationRepository';
import { Conversation } from '../../../../src/services/conversations/domain/entities/Conversation';

function createFakePrisma(): {
  whatsAppConversation: { upsert: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock; findMany: jest.Mock };
} {
  return {
    whatsAppConversation: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'conversation-1',
  tenantId: 'tenant-1',
  sessionName: 'default',
  contactJid: '5511999999999@s.whatsapp.net',
  status: 'BOT',
  createdAt: new Date('2026-07-10T12:00:00Z'),
  updatedAt: new Date('2026-07-10T12:00:00Z'),
};

describe('PrismaConversationRepository', () => {
  describe('upsertByTenantSessionAndContact()', () => {
    it('deve chamar prisma.whatsAppConversation.upsert() com a chave composta e os dados de create mapeados, com update vazio', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);
      const candidate: Conversation = {
        id: 'candidate-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
        createdAt: new Date('2026-07-10T12:00:00Z'),
        updatedAt: new Date('2026-07-10T12:00:00Z'),
      };

      await repo.upsertByTenantSessionAndContact('tenant-1', 'default', '5511999999999@s.whatsapp.net', candidate);

      expect(prisma.whatsAppConversation.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_sessionName_contactJid: {
            tenantId: 'tenant-1',
            sessionName: 'default',
            contactJid: '5511999999999@s.whatsapp.net',
          },
        },
        create: {
          id: 'candidate-id',
          tenantId: 'tenant-1',
          sessionName: 'default',
          contactJid: '5511999999999@s.whatsapp.net',
          status: 'BOT',
          createdAt: new Date('2026-07-10T12:00:00Z'),
          updatedAt: new Date('2026-07-10T12:00:00Z'),
        },
        update: {},
      });
    });

    it('deve mapear o registro retornado (linha vencedora, em caso de corrida) de volta para a entidade de Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact('tenant-1', 'default', '5511999999999@s.whatsapp.net', {
        id: 'candidate-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
        createdAt: new Date('2026-07-10T12:00:00Z'),
        updatedAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(result).toEqual({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
        createdAt: SAMPLE_ROW.createdAt,
        updatedAt: SAMPLE_ROW.updatedAt,
      });
    });

    it('deve mapear status HUMAN do Prisma de volta para "human" no Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({ ...SAMPLE_ROW, status: 'HUMAN' });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact('tenant-1', 'default', '5511999999999@s.whatsapp.net', {
        id: 'candidate-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
        createdAt: new Date('2026-07-10T12:00:00Z'),
        updatedAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(result.status).toBe('human');
    });
  });

  describe('findById() (Milestone 3, Bloco 4 - aditivo)', () => {
    it('chama prisma.whatsAppConversation.findUnique() por id e mapeia o registro para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.findById('conversation-1');

      expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({ where: { id: 'conversation-1' } });
      expect(result).toEqual({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        status: 'bot',
        createdAt: SAMPLE_ROW.createdAt,
        updatedAt: SAMPLE_ROW.updatedAt,
      });
    });

    it('devolve undefined (nao lanca) quando a conversa nao existe', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findUnique.mockResolvedValue(null);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.findById('conversation-inexistente');

      expect(result).toBeUndefined();
    });
  });

  describe('updateStatus() (Milestone 3, Bloco 5 - D10, aditivo)', () => {
    it('chama updateMany() filtrando por id E tenantId, depois busca a conversa atualizada via findById()', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({ ...SAMPLE_ROW, status: 'HUMAN' });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.updateStatus('tenant-1', 'conversation-1', 'human');

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { status: 'HUMAN' },
      });
      expect(result?.status).toBe('human');
    });

    it('devolve undefined (nao lanca) quando updateMany() nao afeta nenhuma linha (conversa inexistente ou de outro tenant)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.updateStatus('tenant-1', 'conversation-de-outro-tenant', 'human');

      expect(result).toBeUndefined();
      expect(prisma.whatsAppConversation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAllByTenant() (Milestone 3, Bloco 5 - D11, aditivo)', () => {
    it('busca limit + 1 linhas, filtra por tenantId e ordena por createdAt/id DESC', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20 });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });

    it('inclui o filtro de status quando informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, status: 'human' });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', status: 'HUMAN' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });

    it('inclui cursor/skip quando um cursor e informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, cursor: 'conversation-anterior' });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        cursor: { id: 'conversation-anterior' },
        skip: 1,
      });
    });

    it('quando vem mais linhas do que o limit, corta para o limit e devolve nextCursor com o id da ultima linha da pagina', async () => {
      const prisma = createFakePrisma();
      const rows = Array.from({ length: 3 }, (_, i) => ({ ...SAMPLE_ROW, id: `conversation-${i + 1}` }));
      prisma.whatsAppConversation.findMany.mockResolvedValue(rows); // limit=2, veio 1 a mais
      const repo = new PrismaConversationRepository(prisma as never);

      const page = await repo.findAllByTenant('tenant-1', { limit: 2 });

      expect(page.conversations).toHaveLength(2);
      expect(page.conversations.map((c) => c.id)).toEqual(['conversation-1', 'conversation-2']);
      expect(page.nextCursor).toBe('conversation-2');
    });

    it('quando vem exatamente (ou menos) linhas que o limit, nextCursor e undefined (nao ha proxima pagina)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaConversationRepository(prisma as never);

      const page = await repo.findAllByTenant('tenant-1', { limit: 20 });

      expect(page.conversations).toHaveLength(1);
      expect(page.nextCursor).toBeUndefined();
    });
  });
});
