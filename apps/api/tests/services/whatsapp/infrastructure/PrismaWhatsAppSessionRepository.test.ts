import { Prisma } from '@prisma/client';

import { PrismaWhatsAppSessionRepository } from '../../../../src/services/whatsapp/infrastructure/repositories/PrismaWhatsAppSessionRepository';
import { WhatsAppSession } from '../../../../src/services/whatsapp/domain/entities/WhatsAppSession';

/**
 * Constrói um `Prisma.PrismaClientKnownRequestError` REAL (não mais uma
 * classe fake) — o pacote `@prisma/client` está instalado e gerado de
 * verdade neste projeto (ver `prisma/schema.prisma` + migrations aplicadas),
 * então simular sua ausência via `jest.mock(..., { virtual: true })` ficou
 * uma premissa obsoleta: criava uma classe concorrente à real, e
 * `error instanceof Prisma.PrismaClientKnownRequestError` (produção) podia
 * divergir da identidade usada aqui no teste, dependendo de como/quando os
 * módulos eram resolvidos — causa raiz de uma falha intermitente encontrada
 * na validação do Bloco 5 da Production Hardening. Usar a classe real
 * elimina essa divergência de identidade por completo, em vez de tentar
 * mantê-la sincronizada com uma cópia fake.
 */
function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '5.22.0',
  });
}

function createFakePrisma(): {
  whatsAppSession: {
    update: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  return {
    whatsAppSession: {
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const SAMPLE_ROW = {
  id: 'session-1',
  tenantId: 'tenant-1',
  sessionName: 'default',
  status: 'CONNECTED',
  disconnectReason: null,
  phoneNumber: '+5511999999999',
  connectedAt: new Date('2026-07-06T10:00:00Z'),
  lastSeen: new Date('2026-07-06T10:05:00Z'),
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-06T10:05:00Z'),
};

describe('PrismaWhatsAppSessionRepository', () => {
  it('findById() deve mapear o registro do Prisma de volta para a entidade de Domain', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.findUnique.mockResolvedValue(SAMPLE_ROW);
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    const session = await repo.findById('session-1');

    expect(session).toEqual({
      id: 'session-1',
      tenantId: 'tenant-1',
      sessionName: 'default',
      provider: 'baileys',
      status: 'connected',
      phoneNumber: '+5511999999999',
      connectedAt: SAMPLE_ROW.connectedAt,
      lastSeen: SAMPLE_ROW.lastSeen,
      createdAt: SAMPLE_ROW.createdAt,
      updatedAt: SAMPLE_ROW.updatedAt,
    });
  });

  it('findById() deve mapear disconnectReason do enum do Prisma de volta para o Domain quando presente (Production Hardening, Bloco 8a)', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      ...SAMPLE_ROW,
      status: 'DISCONNECTED',
      disconnectReason: 'CONNECTION_LOST',
    });
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    const session = await repo.findById('session-1');

    expect(session?.disconnectReason).toBe('connection_lost');
  });

  it('findById() deve retornar null quando o registro não existir', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.findUnique.mockResolvedValue(null);
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    expect(await repo.findById('inexistente')).toBeNull();
  });

  it('findByTenantAndSessionName() deve consultar pela chave composta correta', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.findUnique.mockResolvedValue(SAMPLE_ROW);
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    await repo.findByTenantAndSessionName('tenant-1', 'default');

    expect(prisma.whatsAppSession.findUnique).toHaveBeenCalledWith({
      where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'default' } },
    });
  });

  describe('M2, Fase 1 — findAllByTenant()', () => {
    it('deve consultar filtrando por tenantId e ordenando por sessionName, mapeando todos os registros', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.findMany.mockResolvedValue([SAMPLE_ROW]);
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      const sessions = await repo.findAllByTenant('tenant-1');

      expect(prisma.whatsAppSession.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { sessionName: 'asc' },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-1');
    });

    it('deve retornar lista vazia quando o tenant não tiver sessões', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.findMany.mockResolvedValue([]);
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      expect(await repo.findAllByTenant('tenant-sem-sessoes')).toEqual([]);
    });
  });

  describe('M2, Fase 1 — deleteByTenantAndSessionName()', () => {
    it('deve chamar deleteMany (não delete) com a chave composta, para permanecer idempotente', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.deleteMany.mockResolvedValue({ count: 1 });
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      await repo.deleteByTenantAndSessionName('tenant-1', 'default');

      expect(prisma.whatsAppSession.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', sessionName: 'default' },
      });
    });

    it('deve resolver silenciosamente quando a sessão já não existir (idempotência)', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.deleteMany.mockResolvedValue({ count: 0 });
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      await expect(
        repo.deleteByTenantAndSessionName('tenant-1', 'inexistente'),
      ).resolves.toBeUndefined();
    });
  });

  it('update() deve mapear só os campos presentes em `data`, convertendo status para o enum do Prisma', async () => {
    const prisma = createFakePrisma();
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    await repo.update('session-1', {
      status: 'disconnected',
      lastSeen: new Date('2026-07-06T11:00:00Z'),
    });

    expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DISCONNECTED', lastSeen: new Date('2026-07-06T11:00:00Z') },
    });
  });

  it('update() não deve incluir campos ausentes de `data` (não sobrescreve com undefined)', async () => {
    const prisma = createFakePrisma();
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    await repo.update('session-1', { status: 'connected' });

    const callArgs = prisma.whatsAppSession.update.mock.calls[0][0];
    expect(callArgs.data).toEqual({ status: 'CONNECTED' });
    expect('phoneNumber' in callArgs.data).toBe(false);
    expect('disconnectReason' in callArgs.data).toBe(false);
  });

  describe('Production Hardening, Bloco 8a — update() e disconnectReason (guard por presença de chave, não por valor)', () => {
    it('mapeia disconnectReason para o enum do Prisma quando presente com um valor', async () => {
      const prisma = createFakePrisma();
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      await repo.update('session-1', { disconnectReason: 'timed_out' });

      const callArgs = prisma.whatsAppSession.update.mock.calls[0][0];
      expect(callArgs.data.disconnectReason).toBe('TIMED_OUT');
    });

    it('escreve NULL quando a chave disconnectReason está presente com valor undefined (limpeza intencional, não ausência)', async () => {
      const prisma = createFakePrisma();
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      // Simula exatamente o que `SessionManager.subscribeToProviderEvents`
      // envia numa transição para 'connecting'/'connected': a chave está
      // presente, o valor é `undefined`.
      await repo.update('session-1', { status: 'connecting', disconnectReason: undefined });

      const callArgs = prisma.whatsAppSession.update.mock.calls[0][0];
      expect('disconnectReason' in callArgs.data).toBe(true);
      expect(callArgs.data.disconnectReason).toBeNull();
    });
  });

  it('[idempotência, espelha o Fake usado em SessionManager.test.ts] update() em registro inexistente (P2025) deve resolver silenciosamente, não lançar', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.update.mockRejectedValue(knownRequestError('P2025'));
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    await expect(repo.update('inexistente', { status: 'disconnected' })).resolves.toBeUndefined();
  });

  it('update() deve propagar erros do Prisma que não sejam "registro não encontrado" (P2025)', async () => {
    const prisma = createFakePrisma();
    prisma.whatsAppSession.update.mockRejectedValue(knownRequestError('P2002'));
    const repo = new PrismaWhatsAppSessionRepository(prisma as never);

    await expect(repo.update('session-1', { status: 'disconnected' })).rejects.toThrow();
  });

  describe('[P6] upsertByTenantAndSessionName — upsert atômico', () => {
    it('deve chamar prisma.whatsAppSession.upsert() com a chave composta e os dados de create/update mapeados', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);
      const candidate: WhatsAppSession = {
        id: 'candidate-id',
        tenantId: 'tenant-1',
        sessionName: 'default',
        provider: 'baileys',
        status: 'connecting',
        phoneNumber: undefined,
        connectedAt: undefined,
        lastSeen: new Date('2026-07-06T09:00:00Z'),
        createdAt: new Date('2026-07-06T09:00:00Z'),
        updatedAt: new Date('2026-07-06T09:00:00Z'),
      };

      await repo.upsertByTenantAndSessionName('tenant-1', 'default', candidate, {
        status: 'connecting',
        lastSeen: new Date('2026-07-06T09:05:00Z'),
      });

      expect(prisma.whatsAppSession.upsert).toHaveBeenCalledWith({
        where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'default' } },
        create: {
          id: 'candidate-id',
          tenantId: 'tenant-1',
          sessionName: 'default',
          provider: 'BAILEYS',
          status: 'CONNECTING',
          disconnectReason: null,
          phoneNumber: null,
          connectedAt: null,
          lastSeen: new Date('2026-07-06T09:00:00Z'),
          createdAt: new Date('2026-07-06T09:00:00Z'),
          updatedAt: new Date('2026-07-06T09:00:00Z'),
        },
        update: { status: 'CONNECTING', lastSeen: new Date('2026-07-06T09:05:00Z') },
      });
    });

    it('deve mapear o registro retornado (linha da vencedora, em caso de corrida) de volta para a entidade de Domain', async () => {
      const prisma = createFakePrisma();
      prisma.whatsAppSession.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaWhatsAppSessionRepository(prisma as never);

      const result = await repo.upsertByTenantAndSessionName(
        'tenant-1',
        'default',
        {
          ...SAMPLE_ROW,
          provider: 'baileys',
          status: 'connecting',
          disconnectReason: undefined,
          phoneNumber: undefined,
          connectedAt: undefined,
        },
        { status: 'connecting' },
      );

      expect(result.id).toBe(SAMPLE_ROW.id);
      expect(result.status).toBe('connected'); // valor real vindo do banco (SAMPLE_ROW), não do candidato local
    });
  });
});
