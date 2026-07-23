import { PrismaMessageRepository } from '../../../../src/services/conversations/infrastructure/repositories/PrismaMessageRepository';
import { Message } from '../../../../src/services/conversations/domain/entities/Message';

function createFakePrisma(): { whatsAppMessage: { create: jest.Mock; findMany: jest.Mock } } {
  return {
    whatsAppMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'message-1',
  tenantId: 'tenant-1',
  conversationId: 'conversation-1',
  direction: 'INBOUND',
  content: 'Olá, preciso de ajuda',
  occurredAt: new Date('2026-07-10T12:00:00Z'),
};

describe('PrismaMessageRepository', () => {
  describe('create()', () => {
    it('deve chamar prisma.whatsAppMessage.create() com os dados mapeados, convertendo direction para o enum do Prisma', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);
      const candidate: Omit<Message, 'id'> = {
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      };

      await repo.create(candidate);

      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'INBOUND',
          content: 'Olá, preciso de ajuda',
          occurredAt: new Date('2026-07-10T12:00:00Z'),
        },
      });
    });

    it('deve mapear direction OUTBOUND do Prisma de volta para "outbound" no Domain (estrutural — ainda sem chamador de produção no Bloco 2)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue({ ...SAMPLE_ROW, direction: 'OUTBOUND' });
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: 'Resposta gerada pela IA',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(result.direction).toBe('outbound');
    });

    it('deve devolver a Message criada com o id gerado pelo banco', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(result).toEqual({
        id: 'message-1',
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        occurredAt: SAMPLE_ROW.occurredAt,
      });
    });
  });

  describe('listRecentByConversation() (Milestone 3, Bloco 4 — aditivo)', () => {
    it('chama prisma.whatsAppMessage.findMany() filtrando por tenantId+conversationId, ordenando por occurredAt desc e limitando', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.listRecentByConversation('tenant-1', 'conversation-1', 20);

      expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', conversationId: 'conversation-1' },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      });
    });

    it('mapeia os registros retornados para o Domain, na mesma ordem devolvida pelo Prisma', async () => {
      const prisma = createFakePrisma();
      const olderRow = { ...SAMPLE_ROW, id: 'message-2', content: 'primeira mensagem', occurredAt: new Date('2026-07-10T11:00:00Z') };
      prisma.whatsAppMessage.findMany.mockResolvedValue([SAMPLE_ROW, olderRow]);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.listRecentByConversation('tenant-1', 'conversation-1', 20);

      expect(result).toEqual([
        {
          id: 'message-1',
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'inbound',
          content: 'Olá, preciso de ajuda',
          occurredAt: SAMPLE_ROW.occurredAt,
        },
        {
          id: 'message-2',
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'inbound',
          content: 'primeira mensagem',
          occurredAt: olderRow.occurredAt,
        },
      ]);
    });
  });
});
