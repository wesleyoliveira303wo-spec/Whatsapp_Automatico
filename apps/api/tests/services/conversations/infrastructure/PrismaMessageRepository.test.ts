import { PrismaMessageRepository } from '../../../../src/services/conversations/infrastructure/repositories/PrismaMessageRepository';
import { Message } from '../../../../src/services/conversations/domain/entities/Message';

/**
 * Fase 1, Bloco F1.7 (2026-08-01) — `create()` passou a rodar dentro de
 * `prisma.$transaction([...])` (insere a `Message` + atualiza a prévia da
 * `Conversation` pai atomicamente). O fake de `$transaction` aqui resolve
 * cada operação do array na ordem, mesmo comportamento observável de uma
 * transação bem-sucedida — suficiente para testar o mapeamento de dados
 * deste repositório (a atomicidade em si é garantia do Postgres/Prisma, não
 * deste código).
 */
function createFakePrisma(): {
  whatsAppMessage: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  whatsAppConversation: { updateMany: jest.Mock };
  $transaction: jest.Mock;
} {
  const whatsAppMessage = { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() };
  const whatsAppConversation = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const $transaction = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
  return { whatsAppMessage, whatsAppConversation, $transaction };
}

// Fase 1, Bloco F1.1 (ADR #90): toda linha do banco agora tem `contentType` +
// 4 colunas de mídia (nullable). `SAMPLE_ROW` representa uma mensagem de
// TEXTO (o caso pré-F1.1) — os campos de mídia vêm `null` do Postgres real.
const SAMPLE_ROW = {
  id: 'message-1',
  tenantId: 'tenant-1',
  conversationId: 'conversation-1',
  direction: 'INBOUND',
  content: 'Olá, preciso de ajuda',
  contentType: 'TEXT',
  mediaMimeType: null,
  mediaUrl: null,
  mediaKeyEncrypted: null,
  mediaFileName: null,
  occurredAt: new Date('2026-07-10T12:00:00Z'),
};

// Mensagem de imagem de exemplo — usada nos casos novos de F1.1.
const SAMPLE_IMAGE_ROW = {
  id: 'message-image-1',
  tenantId: 'tenant-1',
  conversationId: 'conversation-1',
  direction: 'INBOUND',
  content: 'Legenda da foto',
  contentType: 'IMAGE',
  mediaMimeType: 'image/jpeg',
  mediaUrl: 'https://mmg.whatsapp.net/fake.enc',
  mediaKeyEncrypted: 'cifrado-base64',
  mediaFileName: null,
  occurredAt: new Date('2026-07-10T12:05:00Z'),
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
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      };

      await repo.create(candidate);

      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'INBOUND',
          content: 'Olá, preciso de ajuda',
          contentType: 'TEXT',
          mediaMimeType: undefined,
          mediaUrl: undefined,
          mediaKeyEncrypted: undefined,
          mediaFileName: undefined,
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
        contentType: 'text',
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
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(result).toEqual({
        id: 'message-1',
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        contentType: 'text',
        media: undefined,
        occurredAt: SAMPLE_ROW.occurredAt,
      });
    });

    // Fase 1, Bloco F1.1 (ADR #90) — casos novos de mídia.
    it('deve enviar os campos de mídia ao criar uma mensagem de imagem', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_IMAGE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Legenda da foto',
        contentType: 'image',
        media: {
          mimeType: 'image/jpeg',
          url: 'https://mmg.whatsapp.net/fake.enc',
          mediaKeyEncrypted: 'cifrado-base64',
        },
        occurredAt: new Date('2026-07-10T12:05:00Z'),
      });

      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'INBOUND',
          content: 'Legenda da foto',
          contentType: 'IMAGE',
          mediaMimeType: 'image/jpeg',
          mediaUrl: 'https://mmg.whatsapp.net/fake.enc',
          mediaKeyEncrypted: 'cifrado-base64',
          mediaFileName: undefined,
          occurredAt: new Date('2026-07-10T12:05:00Z'),
        },
      });
    });

    it('deve reconstruir a referência de mídia (media) ao mapear uma linha de imagem de volta para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_IMAGE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Legenda da foto',
        contentType: 'image',
        media: {
          mimeType: 'image/jpeg',
          url: 'https://mmg.whatsapp.net/fake.enc',
          mediaKeyEncrypted: 'cifrado-base64',
        },
        occurredAt: new Date('2026-07-10T12:05:00Z'),
      });

      expect(result.contentType).toBe('image');
      expect(result.media).toEqual({
        mimeType: 'image/jpeg',
        url: 'https://mmg.whatsapp.net/fake.enc',
        mediaKeyEncrypted: 'cifrado-base64',
        fileName: undefined,
      });
    });

    it('não deve reconstruir media quando contentType é IMAGE mas os campos de mídia vieram incompletos (defesa contra dado inconsistente)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue({ ...SAMPLE_IMAGE_ROW, mediaUrl: null });
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Legenda da foto',
        contentType: 'image',
        occurredAt: new Date('2026-07-10T12:05:00Z'),
      });

      expect(result.media).toBeUndefined();
    });

    // BUGFIX (2026-07-31, Fase 1 F1.3): mídia enviada PELO OPERADOR
    // (`ConversationsService.sendAgentMediaMessage`) grava `mediaUrl`/
    // `mediaKeyEncrypted` como STRING VAZIA de propósito (nunca há URL/chave
    // real do CDN do WhatsApp para um arquivo que nasceu na Dashboard).
    // Antes desta correção, a checagem truthy do mapper descartava `media`
    // inteiro nesse caso (`'' && ...` é falsy) mesmo com `contentType`/
    // `mediaMimeType` corretos — causava bolha vazia na Dashboard mesmo a
    // mensagem tendo sido entregue com sucesso no WhatsApp real.
    it('deve reconstruir media mesmo quando mediaUrl/mediaKeyEncrypted são string vazia (mídia enviada pelo operador, sem referência ao CDN do WhatsApp)', async () => {
      const prisma = createFakePrisma();
      const agentMediaRow = {
        ...SAMPLE_IMAGE_ROW,
        direction: 'OUTBOUND',
        mediaUrl: '',
        mediaKeyEncrypted: '',
        mediaFileName: 'foto.jpg',
      };
      prisma.whatsAppMessage.create.mockResolvedValue(agentMediaRow);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: '',
        contentType: 'image',
        media: { mimeType: 'image/jpeg', url: '', mediaKeyEncrypted: '', fileName: 'foto.jpg' },
        occurredAt: new Date('2026-07-10T12:05:00Z'),
      });

      expect(result.media).toEqual({
        mimeType: 'image/jpeg',
        url: '',
        mediaKeyEncrypted: '',
        fileName: 'foto.jpg',
      });
    });
  });

  describe('create() — prévia denormalizada na Conversation pai (Fase 1, Bloco F1.7)', () => {
    it('atualiza lastMessagePreview/lastMessageAt da conversa dentro da MESMA transação, filtrando por tenantId+conversationId', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: 'Olá, preciso de ajuda',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:00:00Z'),
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: {
          lastMessagePreview: 'Olá, preciso de ajuda',
          lastMessageAt: new Date('2026-07-10T12:00:00Z'),
        },
      });
    });

    it('mensagem de mídia sem legenda: grava o rótulo textual do tipo como prévia', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue(SAMPLE_IMAGE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'inbound',
        content: '',
        contentType: 'image',
        media: {
          mimeType: 'image/jpeg',
          url: 'https://mmg.whatsapp.net/fake.enc',
          mediaKeyEncrypted: 'cifrado-base64',
        },
        occurredAt: new Date('2026-07-10T12:05:00Z'),
      });

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { lastMessagePreview: '📷 Imagem', lastMessageAt: new Date('2026-07-10T12:05:00Z') },
      });
    });

    it('mensagem OUTBOUND (resposta da IA/operador) também atualiza a prévia — não é exclusivo de inbound', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.create.mockResolvedValue({
        ...SAMPLE_ROW,
        direction: 'OUTBOUND',
        content: 'Corte custa R$ 50.',
      });
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.create({
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        direction: 'outbound',
        content: 'Corte custa R$ 50.',
        contentType: 'text',
        occurredAt: new Date('2026-07-10T12:10:00Z'),
      });

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: {
          lastMessagePreview: 'Corte custa R$ 50.',
          lastMessageAt: new Date('2026-07-10T12:10:00Z'),
        },
      });
    });
  });

  describe('findById() (Fase 1, Bloco F1.1, ADR #90 — aditivo)', () => {
    it('chama prisma.whatsAppMessage.findFirst() filtrando por tenantId+id', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.findFirst.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      await repo.findById('tenant-1', 'message-1');

      expect(prisma.whatsAppMessage.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'message-1' },
      });
    });

    it('mapeia a linha encontrada para o Domain, reconstruindo media quando presente', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.findFirst.mockResolvedValue(SAMPLE_IMAGE_ROW);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.findById('tenant-1', 'message-image-1');

      expect(result?.contentType).toBe('image');
      expect(result?.media).toEqual({
        mimeType: 'image/jpeg',
        url: 'https://mmg.whatsapp.net/fake.enc',
        mediaKeyEncrypted: 'cifrado-base64',
        fileName: undefined,
      });
    });

    it('devolve undefined quando a mensagem não existe (ou é de outro tenant)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.findById('tenant-1', 'message-inexistente');

      expect(result).toBeUndefined();
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
      const olderRow = {
        ...SAMPLE_ROW,
        id: 'message-2',
        content: 'primeira mensagem',
        occurredAt: new Date('2026-07-10T11:00:00Z'),
      };
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
          contentType: 'text',
          media: undefined,
          occurredAt: SAMPLE_ROW.occurredAt,
        },
        {
          id: 'message-2',
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          direction: 'inbound',
          content: 'primeira mensagem',
          contentType: 'text',
          media: undefined,
          occurredAt: olderRow.occurredAt,
        },
      ]);
    });

    it('mapeia uma mensagem de imagem na listagem, reconstruindo a referência de mídia', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppMessage.findMany.mockResolvedValue([SAMPLE_IMAGE_ROW]);
      const repo = new PrismaMessageRepository(prisma as never);

      const result = await repo.listRecentByConversation('tenant-1', 'conversation-1', 20);

      expect(result[0].contentType).toBe('image');
      expect(result[0].media).toEqual({
        mimeType: 'image/jpeg',
        url: 'https://mmg.whatsapp.net/fake.enc',
        mediaKeyEncrypted: 'cifrado-base64',
        fileName: undefined,
      });
    });
  });
});
