import { PrismaAiBusinessProfileRepository } from '../../../../src/services/ai/infrastructure/repositories/PrismaAiBusinessProfileRepository';

function createFakePrisma(): { aiBusinessProfile: { findUnique: jest.Mock; upsert: jest.Mock } } {
  return {
    aiBusinessProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

/**
 * Linha de banco completa, incluindo os campos de horário de atendimento (F1.8).
 */
const SAMPLE_ROW = {
  id: 'profile-1',
  tenantId: 'tenant-1',
  sessionName: 'sessao-1',
  content: 'Salão da Maria. Corte R$ 50.',
  createdAt: new Date('2026-07-22T00:00:00Z'),
  updatedAt: new Date('2026-07-22T10:00:00Z'),
  offHoursEnabled: false,
  offHoursMessage: null,
  workingHoursStart: null,
  workingHoursEnd: null,
  workingDays: 62,
  timezone: 'America/Sao_Paulo',
};

describe('PrismaAiBusinessProfileRepository (por sessão desde M6H-3)', () => {
  describe('findByTenantAndSession()', () => {
    it('busca pela chave composta (tenantId, sessionName) e mapeia a linha para o Domain', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.findUnique.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      const result = await repo.findByTenantAndSession('tenant-1', 'sessao-1');

      expect(prisma.aiBusinessProfile.findUnique).toHaveBeenCalledWith({
        where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'sessao-1' } },
      });
      expect(result).toEqual({
        tenantId: 'tenant-1',
        sessionName: 'sessao-1',
        content: 'Salão da Maria. Corte R$ 50.',
        updatedAt: SAMPLE_ROW.updatedAt,
        offHoursEnabled: false,
        offHoursMessage: null,
        workingHoursStart: null,
        workingHoursEnd: null,
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      });
    });

    it('devolve null (não lança) quando a sessão não tem perfil', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.findUnique.mockResolvedValue(null);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      expect(await repo.findByTenantAndSession('tenant-1', 'sessao-sem-perfil')).toBeNull();
    });

    it('isola sessões do mesmo tenant (chave composta diferente → busca com os parâmetros corretos)', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.findUnique.mockResolvedValue(null);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      await repo.findByTenantAndSession('tenant-1', 'sessao-a');
      await repo.findByTenantAndSession('tenant-1', 'sessao-b');

      expect(prisma.aiBusinessProfile.findUnique).toHaveBeenNthCalledWith(1, {
        where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'sessao-a' } },
      });
      expect(prisma.aiBusinessProfile.findUnique).toHaveBeenNthCalledWith(2, {
        where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'sessao-b' } },
      });
    });
  });

  describe('upsert()', () => {
    it('faz upsert com content e todos os campos de horário quando fornecidos', async () => {
      const prisma = createFakePrisma();
      const rowWithOffHours = {
        ...SAMPLE_ROW,
        offHoursEnabled: true,
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      };
      prisma.aiBusinessProfile.upsert.mockResolvedValue(rowWithOffHours);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      const result = await repo.upsert('tenant-1', 'sessao-1', {
        content: 'Salão da Maria. Corte R$ 50.',
        offHoursEnabled: true,
        offHoursMessage: null,
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      });

      // Verifica que o upsert foi chamado com os campos de horário em create e update
      expect(prisma.aiBusinessProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'sessao-1' } },
          create: expect.objectContaining({
            content: 'Salão da Maria. Corte R$ 50.',
            offHoursEnabled: true,
            workingHoursStart: '09:00',
            workingHoursEnd: '18:00',
            workingDays: 62,
            timezone: 'America/Sao_Paulo',
          }),
          update: expect.objectContaining({
            content: 'Salão da Maria. Corte R$ 50.',
            offHoursEnabled: true,
            workingHoursStart: '09:00',
            workingHoursEnd: '18:00',
          }),
        }),
      );
      // Resultado mapeado corretamente para o Domain
      expect(result.offHoursEnabled).toBe(true);
      expect(result.workingHoursStart).toBe('09:00');
    });

    it('campos de horário opcionais ausentes NÃO são incluídos no payload (Prisma só toca o que é explícito)', async () => {
      const prisma = createFakePrisma();
      prisma.aiBusinessProfile.upsert.mockResolvedValue(SAMPLE_ROW);
      const repo = new PrismaAiBusinessProfileRepository(prisma as never);

      await repo.upsert('tenant-1', 'sessao-1', { content: 'Só o texto.' });

      const call = prisma.aiBusinessProfile.upsert.mock.calls[0][0];
      // Campos opcionais ausentes não devem aparecer no payload
      expect(call.create).not.toHaveProperty('offHoursEnabled');
      expect(call.create).not.toHaveProperty('workingHoursStart');
      expect(call.update).not.toHaveProperty('offHoursEnabled');
    });
  });
});
