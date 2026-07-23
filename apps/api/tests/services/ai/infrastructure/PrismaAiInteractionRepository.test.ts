import { PrismaAiInteractionRepository } from '../../../../src/services/ai/infrastructure/repositories/PrismaAiInteractionRepository';
import { AiInteraction } from '../../../../src/services/ai/domain/entities/AiInteraction';

function createFakePrisma(): { aiInteraction: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock } } {
  return {
    aiInteraction: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'ai-interaction-1',
  tenantId: 'tenant-1',
  conversationId: 'conversation-1',
  messageId: null,
  provider: 'CLAUDE',
  model: 'claude-opus-4-8',
  promptVersion: 'v1',
  tokensInput: 12,
  tokensOutput: 8,
  costUsd: { toString: () => '0.00012000' },
  latencyMs: 350,
  status: 'SUCCESS',
  errorMessage: null,
  createdAt: new Date('2026-07-10T12:00:00Z'),
};

function buildInteraction(overrides: Partial<Omit<AiInteraction, 'id' | 'createdAt'>> = {}): Omit<AiInteraction, 'id' | 'createdAt'> {
  return {
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    provider: 'claude',
    model: 'claude-opus-4-8',
    promptVersion: 'v1',
    tokensInput: 12,
    tokensOutput: 8,
    costUsd: '0.00012000',
    latencyMs: 350,
    status: 'success',
    ...overrides,
  };
}

describe('PrismaAiInteractionRepository', () => {
  describe('record()', () => {
    it('chama prisma.aiInteraction.create() com os dados mapeados, convertendo provider/status para os enums do Prisma', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.create.mockResolvedValue({});
      const repo = new PrismaAiInteractionRepository(prisma as never);

      await repo.record(buildInteraction());

      expect(prisma.aiInteraction.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          messageId: undefined,
          provider: 'CLAUDE',
          model: 'claude-opus-4-8',
          promptVersion: 'v1',
          tokensInput: 12,
          tokensOutput: 8,
          costUsd: '0.00012000',
          latencyMs: 350,
          status: 'SUCCESS',
          errorMessage: undefined,
        },
      });
    });

    it('mapeia status "validation_rejected" para VALIDATION_REJECTED', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.create.mockResolvedValue({});
      const repo = new PrismaAiInteractionRepository(prisma as never);

      await repo.record(buildInteraction({ status: 'validation_rejected', errorMessage: 'Resposta vazia' }));

      expect(prisma.aiInteraction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'VALIDATION_REJECTED', errorMessage: 'Resposta vazia' }) }),
      );
    });

    it('mapeia status "provider_error" para PROVIDER_ERROR e aceita model undefined', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.create.mockResolvedValue({});
      const repo = new PrismaAiInteractionRepository(prisma as never);

      await repo.record(
        buildInteraction({
          status: 'provider_error',
          model: undefined,
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          errorMessage: 'Falha de rede',
        }),
      );

      expect(prisma.aiInteraction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROVIDER_ERROR', model: undefined, errorMessage: 'Falha de rede' }) }),
      );
    });

    it('devolve o id gerado pelo banco (achado F2 - preparacao para linkMessage() futuro)', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.create.mockResolvedValue({ id: 'ai-interaction-1' });
      const repo = new PrismaAiInteractionRepository(prisma as never);

      const result = await repo.record(buildInteraction());

      expect(result).toBe('ai-interaction-1');
    });
  });

  describe('linkMessage() (achado F2, preparacao arquitetural - sem chamador de producao ainda)', () => {
    it('chama prisma.aiInteraction.update() com where por id e data.messageId', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.update.mockResolvedValue({});
      const repo = new PrismaAiInteractionRepository(prisma as never);

      await repo.linkMessage('ai-interaction-1', 'message-1');

      expect(prisma.aiInteraction.update).toHaveBeenCalledWith({
        where: { id: 'ai-interaction-1' },
        data: { messageId: 'message-1' },
      });
    });

    it('nao devolve nada (void)', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.update.mockResolvedValue({ id: 'ai-interaction-1' });
      const repo = new PrismaAiInteractionRepository(prisma as never);

      const result = await repo.linkMessage('ai-interaction-1', 'message-1');

      expect(result).toBeUndefined();
    });
  });

  describe('listByConversation() (Milestone 3, Bloco 5 - D13, aditivo)', () => {
    it('filtra por tenantId E conversationId, ordena por createdAt DESC e mapeia as linhas de volta para o Domain (costUsd via toString())', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaAiInteractionRepository(prisma as never);

      const result = await repo.listByConversation('tenant-1', 'conversation-1', 20);

      expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', conversationId: 'conversation-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      expect(result).toEqual([
        {
          id: 'ai-interaction-1',
          tenantId: 'tenant-1',
          conversationId: 'conversation-1',
          messageId: undefined,
          provider: 'claude',
          model: 'claude-opus-4-8',
          promptVersion: 'v1',
          tokensInput: 12,
          tokensOutput: 8,
          costUsd: '0.00012000',
          latencyMs: 350,
          status: 'success',
          errorMessage: undefined,
          createdAt: SAMPLE_ROW.createdAt,
        },
      ]);
    });

    it('devolve lista vazia (nao lanca) quando nao ha interacoes para o par tenantId/conversationId', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.findMany.mockResolvedValue([]);
      const repo = new PrismaAiInteractionRepository(prisma as never);

      const result = await repo.listByConversation('tenant-1', 'conversation-de-outro-tenant', 20);

      expect(result).toEqual([]);
    });
  });

  describe('listByTenant() (Milestone 3, Bloco 5 - D13, aditivo)', () => {
    it('filtra so por tenantId (sem conversationId) e ordena por createdAt DESC', async () => {
      const prisma = createFakePrisma();
      prisma.aiInteraction.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaAiInteractionRepository(prisma as never);

      const result = await repo.listByTenant('tenant-1', 50);

      expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toHaveLength(1);
      expect(result[0].costUsd).toBe('0.00012000');
    });
  });
});
