import { PrismaConversationRepository } from '../../../../src/services/conversations/infrastructure/repositories/PrismaConversationRepository';
import { Conversation } from '../../../../src/services/conversations/domain/entities/Conversation';

function createFakePrisma(): {
  whatsAppConversation: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
  };
} {
  return {
    whatsAppConversation: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
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
  assignedToUserId: null,
  escalatedAt: null,
  unreadCount: 0,
  stage: 'NEW',
  stageSetBy: 'AI',
  stageUpdatedAt: new Date('2026-07-10T12:00:00Z'),
  excludedFromPipeline: false,
  createdAt: new Date('2026-07-10T12:00:00Z'),
  updatedAt: new Date('2026-07-10T12:00:00Z'),
};

function buildCandidate(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'candidate-id',
    tenantId: 'tenant-1',
    sessionName: 'default',
    contactJid: '5511999999999@s.whatsapp.net',
    status: 'bot',
    unreadCount: 0,
    stage: 'new',
    stageSetBy: 'ai',
    stageUpdatedAt: new Date('2026-07-10T12:00:00Z'),
    excludedFromPipeline: false,
    tags: [],
    createdAt: new Date('2026-07-10T12:00:00Z'),
    updatedAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Redesign 2026-08-05 (R4), estendido em 2026-08-20 — `include` que as 3
 * queries de leitura completa (upsert/findUnique/findMany) sempre acrescentam
 * (ver `CONVERSATION_INCLUDE`). `contact: { select: { name: true } }`
 * resolve `savedContactName` — padronização de exibição de contato.
 */
const TAGS_INCLUDE = {
  include: {
    conversationTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    contact: { select: { name: true } },
  },
};

describe('PrismaConversationRepository', () => {
  describe('upsertByTenantSessionAndContact()', () => {
    it('deve chamar prisma.whatsAppConversation.upsert() com a chave composta e os dados de create mapeados, com update vazio', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);
      const candidate = buildCandidate();

      await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        candidate,
      );

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
          contactName: undefined,
          contactId: undefined,
          status: 'BOT',
          stage: 'NEW',
          stageSetBy: 'AI',
          createdAt: new Date('2026-07-10T12:00:00Z'),
          updatedAt: new Date('2026-07-10T12:00:00Z'),
        },
        update: {},
        ...TAGS_INCLUDE,
      });
    });

    it('Fase 1, Bloco F1.7: mapeia lastMessagePreview/lastMessageAt quando presentes na linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({
        ...SAMPLE_ROW,
        lastMessagePreview: 'Olá, tudo bem?',
        lastMessageAt: new Date('2026-08-01T10:00:00Z'),
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate(),
      );

      expect(result.lastMessagePreview).toBe('Olá, tudo bem?');
      expect(result.lastMessageAt).toEqual(new Date('2026-08-01T10:00:00Z'));
    });

    it('Fase 1, Bloco F1.7: lastMessagePreview/lastMessageAt ausentes (null) viram undefined — conversa sem mensagem ainda', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({
        ...SAMPLE_ROW,
        lastMessagePreview: null,
        lastMessageAt: null,
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate(),
      );

      expect(result.lastMessagePreview).toBeUndefined();
      expect(result.lastMessageAt).toBeUndefined();
    });

    it('deve mapear o registro retornado (linha vencedora, em caso de corrida) de volta para a entidade de Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate(),
      );

      expect(result).toEqual({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        contactName: undefined,
        status: 'bot',
        assignedToUserId: undefined,
        escalatedAt: undefined,
        unreadCount: 0,
        stage: 'new',
        stageSetBy: 'ai',
        stageUpdatedAt: SAMPLE_ROW.stageUpdatedAt,
        excludedFromPipeline: false,
        tags: [],
        createdAt: SAMPLE_ROW.createdAt,
        updatedAt: SAMPLE_ROW.updatedAt,
      });
    });

    it('inclui contactName no create E no update quando informado (Milestone 6, Bloco M6H-2b — o contato pode mudar o nome de exibição a qualquer momento)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({
        ...SAMPLE_ROW,
        contactName: 'Maria Silva',
      });
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate({ contactName: 'Maria Silva' }),
      );

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
          contactName: 'Maria Silva',
          contactId: undefined,
          status: 'BOT',
          stage: 'NEW',
          stageSetBy: 'AI',
          createdAt: new Date('2026-07-10T12:00:00Z'),
          updatedAt: new Date('2026-07-10T12:00:00Z'),
        },
        update: { contactName: 'Maria Silva' },
        ...TAGS_INCLUDE,
      });
    });

    // Fase L, Bloco L5 (2026-08-20) — antes deste bloco, `contactId`/`stage`/
    // `stageSetBy` do `create` eram silenciosamente ignorados (só os defaults
    // de coluna valiam). `WhatsAppCampaignMessageSender` (primeiro contato de
    // campanha) passou a depender de que eles sejam de fato persistidos.
    it('inclui contactId/stage/stageSetBy no create quando informados (primeiro contato de campanha)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({
        ...SAMPLE_ROW,
        contactId: 'contact-9',
        stage: 'CONTACTED',
      });
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate({ contactId: 'contact-9', stage: 'contacted', stageSetBy: 'ai' }),
      );

      expect(prisma.whatsAppConversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            contactId: 'contact-9',
            stage: 'CONTACTED',
            stageSetBy: 'AI',
          }),
        }),
      );
    });

    it('NÃO inclui contactName no update quando a mensagem não trouxe nome (nunca apaga um nome já salvo por falta de nome numa mensagem posterior)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate(),
      );

      expect(prisma.whatsAppConversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
    });

    it('mapeia contactName do registro retornado para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({
        ...SAMPLE_ROW,
        contactName: 'Maria Silva',
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate({ contactName: 'Maria Silva' }),
      );

      expect(result.contactName).toBe('Maria Silva');
    });

    it('deve mapear status HUMAN do Prisma de volta para "human" no Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.upsert.mockResolvedValue({ ...SAMPLE_ROW, status: 'HUMAN' });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.upsertByTenantSessionAndContact(
        'tenant-1',
        'default',
        '5511999999999@s.whatsapp.net',
        buildCandidate(),
      );

      expect(result.status).toBe('human');
    });
  });

  describe('findById() (Milestone 3, Bloco 4 - aditivo)', () => {
    it('chama prisma.whatsAppConversation.findUnique() por id e mapeia o registro para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.findById('conversation-1');

      expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conversation-1' },
        ...TAGS_INCLUDE,
      });
      expect(result).toEqual({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        sessionName: 'default',
        contactJid: '5511999999999@s.whatsapp.net',
        contactName: undefined,
        status: 'bot',
        assignedToUserId: undefined,
        escalatedAt: undefined,
        unreadCount: 0,
        stage: 'new',
        stageSetBy: 'ai',
        stageUpdatedAt: SAMPLE_ROW.stageUpdatedAt,
        excludedFromPipeline: false,
        tags: [],
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

    // Padronização de exibição de contato (2026-08-20) — `savedContactName`
    // vem do relacionamento `contact` incluído por `CONVERSATION_INCLUDE`.
    describe('savedContactName (padronização de exibição de contato, 2026-08-20)', () => {
      it('mapeia contact.name para savedContactName quando o Contato tem nome salvo', async () => {
        const prisma = createFakePrisma();
        prisma.whatsAppConversation.findUnique.mockResolvedValue({
          ...SAMPLE_ROW,
          contact: { name: 'Maria Salva' },
        });
        const repo = new PrismaConversationRepository(prisma as never);

        const result = await repo.findById('conversation-1');

        expect(result?.savedContactName).toBe('Maria Salva');
      });

      it('deixa savedContactName indefinido quando não há contactId (contact: null)', async () => {
        const prisma = createFakePrisma();
        prisma.whatsAppConversation.findUnique.mockResolvedValue({
          ...SAMPLE_ROW,
          contact: null,
        });
        const repo = new PrismaConversationRepository(prisma as never);

        const result = await repo.findById('conversation-1');

        expect(result?.savedContactName).toBeUndefined();
      });

      it('deixa savedContactName indefinido quando o Contato existe mas ainda não tem nome salvo', async () => {
        const prisma = createFakePrisma();
        prisma.whatsAppConversation.findUnique.mockResolvedValue({
          ...SAMPLE_ROW,
          contact: { name: null },
        });
        const repo = new PrismaConversationRepository(prisma as never);

        const result = await repo.findById('conversation-1');

        expect(result?.savedContactName).toBeUndefined();
      });
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
    it('busca limit + 1 linhas, filtra por tenantId e ordena por lastMessageAt/id DESC (última mensagem, 2026-08-01)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20 });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 21,
        ...TAGS_INCLUDE,
      });
    });

    it('inclui o filtro de status quando informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, status: 'human' });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', status: 'HUMAN' },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 21,
        ...TAGS_INCLUDE,
      });
    });

    it('inclui o filtro de sessionName quando informado (Milestone 6, Bloco M6H-2)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, sessionName: 'vendas' });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'vendas' },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 21,
        ...TAGS_INCLUDE,
      });
    });

    it('inclui o filtro de needsHumanAttention quando informado (reforma do escalonamento, 2026-07-25)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, needsHumanAttention: true });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', escalatedAt: { not: null } },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 21,
        ...TAGS_INCLUDE,
      });
    });

    it('inclui cursor/skip quando um cursor e informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 20, cursor: 'conversation-anterior' });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 21,
        cursor: { id: 'conversation-anterior' },
        skip: 1,
        ...TAGS_INCLUDE,
      });
    });

    it('quando vem mais linhas do que o limit, corta para o limit e devolve nextCursor com o id da ultima linha da pagina', async () => {
      const prisma = createFakePrisma();
      const rows = Array.from({ length: 3 }, (_, i) => ({
        ...SAMPLE_ROW,
        id: `conversation-${i + 1}`,
      }));
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

  describe('flagNeedsHumanAttention() (reforma do escalonamento, 2026-07-25)', () => {
    it('chama updateMany() gravando escalatedAt = at, depois busca a conversa atualizada via findById()', async () => {
      const prisma = createFakePrisma();
      const at = new Date('2026-07-25T16:00:00Z');
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({ ...SAMPLE_ROW, escalatedAt: at });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.flagNeedsHumanAttention('tenant-1', 'conversation-1', at);

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { escalatedAt: at },
      });
      expect(result?.escalatedAt).toEqual(at);
    });

    it('devolve undefined (nao lanca) quando updateMany() nao afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.flagNeedsHumanAttention(
        'tenant-1',
        'conversation-de-outro-tenant',
        new Date(),
      );

      expect(result).toBeUndefined();
    });
  });

  describe('incrementUnreadCount() (indicador de não lidas, 2026-07-25)', () => {
    it('chama updateMany() com increment: 1', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.incrementUnreadCount('tenant-1', 'conversation-1');

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { unreadCount: { increment: 1 } },
      });
    });

    it('nao lanca quando a conversa nao existe/nao pertence ao tenant (updateMany count 0)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      await expect(
        repo.incrementUnreadCount('tenant-1', 'conversation-inexistente'),
      ).resolves.toBeUndefined();
    });
  });

  describe('markAsRead() (indicador de não lidas, 2026-07-25; correção de updatedAt, 2026-07-26)', () => {
    it('preserva o updatedAt atual (le antes, regrava o MESMO valor) — nao deve mexer na ordenacao da lista', async () => {
      const currentUpdatedAt = new Date('2026-07-25T18:13:00Z');
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ updatedAt: currentUpdatedAt });
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({
        ...SAMPLE_ROW,
        unreadCount: 0,
        updatedAt: currentUpdatedAt,
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.markAsRead('tenant-1', 'conversation-1');

      expect(prisma.whatsAppConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        select: { updatedAt: true },
      });
      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { unreadCount: 0, updatedAt: currentUpdatedAt },
      });
      expect(result?.unreadCount).toBe(0);
    });

    it('devolve undefined (nao lanca, nao chama updateMany) quando a conversa nao existe/nao pertence ao tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.markAsRead('tenant-1', 'conversation-de-outro-tenant');

      expect(result).toBeUndefined();
      expect(prisma.whatsAppConversation.updateMany).not.toHaveBeenCalled();
    });

    it('devolve undefined (nao lanca) quando updateMany() nao afeta nenhuma linha (corrida rara)', async () => {
      const currentUpdatedAt = new Date('2026-07-25T18:13:00Z');
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ updatedAt: currentUpdatedAt });
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.markAsRead('tenant-1', 'conversation-1');

      expect(result).toBeUndefined();
    });
  });

  describe('updateStage() (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
    it('chama updateMany() gravando stage/stageSetBy/stageUpdatedAt, depois busca a conversa atualizada via findById()', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({
        ...SAMPLE_ROW,
        stage: 'NEGOTIATING',
        stageSetBy: 'HUMAN',
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.updateStage('tenant-1', 'conversation-1', 'negotiating', 'human');

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { stage: 'NEGOTIATING', stageSetBy: 'HUMAN', stageUpdatedAt: expect.any(Date) },
      });
      expect(result?.stage).toBe('negotiating');
      expect(result?.stageSetBy).toBe('human');
    });

    it('mapeia setBy "ai" para o enum Prisma AI', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({
        ...SAMPLE_ROW,
        stage: 'CONTACTED',
        stageSetBy: 'AI',
      });
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.updateStage('tenant-1', 'conversation-1', 'contacted', 'ai');

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: 'CONTACTED', stageSetBy: 'AI' }),
        }),
      );
    });

    it('devolve undefined (nao lanca) quando updateMany() nao afeta nenhuma linha (conversa inexistente ou de outro tenant)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.updateStage(
        'tenant-1',
        'conversation-de-outro-tenant',
        'closed_won',
        'human',
      );

      expect(result).toBeUndefined();
      expect(prisma.whatsAppConversation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('setExcludedFromPipeline() — ADR #94 (2026-08-01, validação Fase 1)', () => {
    it('chama updateMany() gravando excludedFromPipeline, depois busca a conversa atualizada via findById()', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppConversation.findUnique.mockResolvedValue({
        ...SAMPLE_ROW,
        excludedFromPipeline: true,
      });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.setExcludedFromPipeline('tenant-1', 'conversation-1', true);

      expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conversation-1', tenantId: 'tenant-1' },
        data: { excludedFromPipeline: true },
      });
      expect(result?.excludedFromPipeline).toBe(true);
    });

    it('devolve undefined (nao lanca) quando updateMany() nao afeta nenhuma linha (conversa inexistente ou de outro tenant)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaConversationRepository(prisma as never);

      const result = await repo.setExcludedFromPipeline(
        'tenant-1',
        'conversation-de-outro-tenant',
        true,
      );

      expect(result).toBeUndefined();
      expect(prisma.whatsAppConversation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAllByTenant() — filtro excludedFromPipeline (ADR #94)', () => {
    it('inclui excludedFromPipeline no where só quando informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 50, excludedFromPipeline: false });

      expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ excludedFromPipeline: false }),
        }),
      );
    });

    it('não inclui excludedFromPipeline no where quando ausente (sem filtro)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppConversation.findMany.mockResolvedValue([]);
      const repo = new PrismaConversationRepository(prisma as never);

      await repo.findAllByTenant('tenant-1', { limit: 50 });

      const call = prisma.whatsAppConversation.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('excludedFromPipeline');
    });
  });
});
