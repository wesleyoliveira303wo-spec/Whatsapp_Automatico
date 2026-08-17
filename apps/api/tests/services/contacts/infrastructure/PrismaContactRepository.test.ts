import { PrismaContactRepository } from '../../../../src/services/contacts/infrastructure/repositories/PrismaContactRepository';

function createFakePrisma(): {
  whatsAppContact: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
} {
  return {
    whatsAppContact: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'contact-1',
  tenantId: 'tenant-1',
  phoneE164: '5521988887777',
  name: null as string | null,
  source: 'WHATSAPP',
  optOutAt: null as Date | null,
  createdAt: new Date('2026-08-15T00:00:00Z'),
  updatedAt: new Date('2026-08-15T00:00:00Z'),
};

describe('PrismaContactRepository (Fase L, Blocos L1/L1b)', () => {
  describe('findOrCreateByPhone()', () => {
    it('faz upsert pela chave única (tenantId, phoneE164), com update vazio (nunca sobrescreve)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.findOrCreateByPhone({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        name: 'Maria',
        source: 'import',
      });

      expect(prisma.whatsAppContact.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_phoneE164: { tenantId: 'tenant-1', phoneE164: '5521988887777' },
        },
        update: {},
        create: {
          tenantId: 'tenant-1',
          phoneE164: '5521988887777',
          name: 'Maria',
          source: 'IMPORT',
        },
      });
    });

    it('mapeia source enum (Domain <-> Prisma) nos dois sentidos', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.upsert.mockResolvedValue({ ...SAMPLE_ROW, source: 'MANUAL' });
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.findOrCreateByPhone({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        source: 'manual',
      });

      expect(result.source).toBe('manual');
    });

    // Fluxo normal (mensagem chegando): o banco decide a data com `now()`.
    it('NÃO envia createdAt quando não informado — deixa o default do banco valer', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.findOrCreateByPhone({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        source: 'whatsapp',
      });

      const { create } = prisma.whatsAppContact.upsert.mock.calls[0][0];
      expect(create).not.toHaveProperty('createdAt');
    });

    // Backfill do histórico: a data que importa é a da primeira conversa da
    // pessoa, não o instante em que o script rodou.
    it('envia createdAt quando informado (backfill do histórico)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);
      const primeiraConversa = new Date('2026-08-07T20:04:17.064Z');

      await repo.findOrCreateByPhone({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        source: 'whatsapp',
        createdAt: primeiraConversa,
      });

      const { create } = prisma.whatsAppContact.upsert.mock.calls[0][0];
      expect(create.createdAt).toBe(primeiraConversa);
    });

    it('converte name null do banco para undefined no Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.findOrCreateByPhone({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        source: 'whatsapp',
      });

      expect(result.name).toBeUndefined();
    });
  });

  describe('findByPhone()', () => {
    it('busca por (tenantId, phoneE164) via findUnique', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.findByPhone('tenant-1', '5521988887777');

      expect(prisma.whatsAppContact.findUnique).toHaveBeenCalledWith({
        where: { tenantId_phoneE164: { tenantId: 'tenant-1', phoneE164: '5521988887777' } },
      });
      expect(result?.id).toBe('contact-1');
    });

    it('devolve undefined quando não existe', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findUnique.mockResolvedValue(null);
      const repo = new PrismaContactRepository(prisma as never);

      expect(await repo.findByPhone('tenant-1', '5521900000000')).toBeUndefined();
    });
  });

  describe('findById()', () => {
    it('busca escopado por (id, tenantId) via findFirst — nunca devolve contato de outro tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findFirst.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.findById('tenant-1', 'contact-1');

      expect(prisma.whatsAppContact.findFirst).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1' },
      });
    });
  });

  describe('setNameIfMissing()', () => {
    it('atualiza via updateMany com name: null no where — só preenche, nunca sobrescreve', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.updateMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaContactRepository(prisma as never);

      await repo.setNameIfMissing('tenant-1', 'contact-1', 'Maria da Padaria');

      expect(prisma.whatsAppContact.updateMany).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1', name: null },
        data: { name: 'Maria da Padaria' },
      });
    });
  });

  describe('setOptOutAt()', () => {
    it('atualiza via updateMany escopado por (id, tenantId) e devolve o contato atualizado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.updateMany.mockResolvedValue({ count: 1 });
      const at = new Date('2026-08-16T12:00:00Z');
      prisma.whatsAppContact.findFirst.mockResolvedValue({ ...SAMPLE_ROW, optOutAt: at });
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.setOptOutAt('tenant-1', 'contact-1', at);

      expect(prisma.whatsAppContact.updateMany).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1' },
        data: { optOutAt: at },
      });
      expect(result?.optOutAt).toBe(at);
    });

    it('aceita at: null para limpar (opt-in)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.updateMany.mockResolvedValue({ count: 1 });
      prisma.whatsAppContact.findFirst.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.setOptOutAt('tenant-1', 'contact-1', null);

      expect(prisma.whatsAppContact.updateMany).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1' },
        data: { optOutAt: null },
      });
    });

    it('devolve undefined (IDOR-safe) quando updateMany não afeta nenhuma linha', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.updateMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.setOptOutAt('tenant-1', 'contact-de-outro-tenant', new Date());

      expect(result).toBeUndefined();
      expect(prisma.whatsAppContact.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('listByTenant()', () => {
    /** Linha como o Prisma devolve COM o `include` da conversa mais recente. */
    const ROW_WITH_CONVERSATIONS = { ...SAMPLE_ROW, conversations: [] as unknown[] };

    it('lista por tenantId, ordenado por createdAt+id desc, sem filtro de busca', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findMany.mockResolvedValue([ROW_WITH_CONVERSATIONS]);
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.listByTenant('tenant-1', { limit: 20 });

      expect(prisma.whatsAppContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 21,
        }),
      );
      expect(result.contacts).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    // Um join lateral (take: 1) em vez de uma consulta por linha — é o que
    // evita N+1 na coluna "Último contato"/botão "Abrir conversa".
    it('inclui a conversa MAIS RECENTE de cada contato numa única consulta', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findMany.mockResolvedValue([ROW_WITH_CONVERSATIONS]);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.listByTenant('tenant-1', { limit: 20 });

      const [args] = prisma.whatsAppContact.findMany.mock.calls[0];
      expect(args.include.conversations).toMatchObject({
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        take: 1,
      });
    });

    it('mapeia a conversa incluída para os campos de atividade do read model', async () => {
      const prisma = createFakePrisma();
      const lastMessageAt = new Date('2026-08-14T10:00:00Z');
      prisma.whatsAppContact.findMany.mockResolvedValue([
        {
          ...SAMPLE_ROW,
          conversations: [{ id: 'conv-1', sessionName: 'vendas', lastMessageAt }],
        },
      ]);
      const repo = new PrismaContactRepository(prisma as never);

      const { contacts } = await repo.listByTenant('tenant-1', { limit: 20 });

      expect(contacts[0]).toMatchObject({
        lastConversationId: 'conv-1',
        lastConversationSessionName: 'vendas',
        lastActivityAt: lastMessageAt,
      });
    });

    it('deixa os campos de atividade indefinidos para contato sem conversa', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findMany.mockResolvedValue([ROW_WITH_CONVERSATIONS]);
      const repo = new PrismaContactRepository(prisma as never);

      const { contacts } = await repo.listByTenant('tenant-1', { limit: 20 });

      expect(contacts[0].lastConversationId).toBeUndefined();
      expect(contacts[0].lastActivityAt).toBeUndefined();
    });

    it('aplica cursor com skip: 1 quando informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findMany.mockResolvedValue([]);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.listByTenant('tenant-1', { limit: 20, cursor: 'contact-1' });

      expect(prisma.whatsAppContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'contact-1' }, skip: 1 }),
      );
    });

    it('filtra por nome OU telefone (case-insensitive no nome) quando search é informado', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.findMany.mockResolvedValue([]);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.listByTenant('tenant-1', { limit: 20, search: 'maria' });

      expect(prisma.whatsAppContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            OR: [
              { name: { contains: 'maria', mode: 'insensitive' } },
              { phoneE164: { contains: 'maria' } },
            ],
          },
        }),
      );
    });

    it('devolve nextCursor quando há mais uma página (busca limit+1 e corta)', async () => {
      const prisma = createFakePrisma();
      const rows = Array.from({ length: 3 }, (_, i) => ({
        ...SAMPLE_ROW,
        id: `contact-${i + 1}`,
        conversations: [],
      }));
      prisma.whatsAppContact.findMany.mockResolvedValue(rows);
      const repo = new PrismaContactRepository(prisma as never);

      const result = await repo.listByTenant('tenant-1', { limit: 2 });

      expect(result.contacts).toHaveLength(2);
      expect(result.nextCursor).toBe('contact-2');
    });
  });

  describe('countStats()', () => {
    it('conta total e com-conversa, derivando sem-conversa por subtração', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.count.mockResolvedValueOnce(23).mockResolvedValueOnce(18);
      const repo = new PrismaContactRepository(prisma as never);

      const stats = await repo.countStats('tenant-1');

      expect(stats).toEqual({ total: 23, withConversation: 18, withoutConversation: 5 });
      // A segunda contagem filtra por "tem ao menos uma conversa".
      expect(prisma.whatsAppContact.count).toHaveBeenNthCalledWith(2, {
        where: { tenantId: 'tenant-1', conversations: { some: {} } },
      });
    });

    it('escopa as duas contagens pelo tenant', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppContact.count.mockResolvedValue(0);
      const repo = new PrismaContactRepository(prisma as never);

      await repo.countStats('tenant-1');

      expect(prisma.whatsAppContact.count).toHaveBeenNthCalledWith(1, {
        where: { tenantId: 'tenant-1' },
      });
    });
  });
});
