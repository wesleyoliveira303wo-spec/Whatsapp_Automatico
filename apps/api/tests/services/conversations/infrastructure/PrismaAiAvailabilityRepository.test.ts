import { PrismaAiAvailabilityRepository } from '../../../../src/services/conversations/infrastructure/repositories/PrismaAiAvailabilityRepository';

function createFakePrisma(): { aiBusinessProfile: { findUnique: jest.Mock } } {
  return { aiBusinessProfile: { findUnique: jest.fn() } };
}

/**
 * Fase 1 (2026-08-07) — Botão POWER. `PrismaAiAvailabilityRepository` lê SÓ
 * a coluna `aiEnabled` da mesma tabela do Cérebro da IA (`ai_business_profiles`).
 */
describe('PrismaAiAvailabilityRepository', () => {
  it('devolve true quando a sessão tem a IA ligada', async () => {
    const prisma = createFakePrisma();
    prisma.aiBusinessProfile.findUnique.mockResolvedValue({ aiEnabled: true });
    const repo = new PrismaAiAvailabilityRepository(prisma as never);

    expect(await repo.isEnabled('tenant-1', 'sessao-1')).toBe(true);
    expect(prisma.aiBusinessProfile.findUnique).toHaveBeenCalledWith({
      where: { tenantId_sessionName: { tenantId: 'tenant-1', sessionName: 'sessao-1' } },
      select: { aiEnabled: true },
    });
  });

  it('devolve false quando a sessão tem a IA desligada', async () => {
    const prisma = createFakePrisma();
    prisma.aiBusinessProfile.findUnique.mockResolvedValue({ aiEnabled: false });
    const repo = new PrismaAiAvailabilityRepository(prisma as never);

    expect(await repo.isEnabled('tenant-1', 'sessao-1')).toBe(false);
  });

  it('devolve true (default ligado) quando a sessão nunca teve nenhum perfil configurado', async () => {
    const prisma = createFakePrisma();
    prisma.aiBusinessProfile.findUnique.mockResolvedValue(null);
    const repo = new PrismaAiAvailabilityRepository(prisma as never);

    expect(await repo.isEnabled('tenant-1', 'sessao-nunca-configurada')).toBe(true);
  });

  it('isola sessões do mesmo tenant (chave composta correta por chamada)', async () => {
    const prisma = createFakePrisma();
    prisma.aiBusinessProfile.findUnique.mockResolvedValueOnce({ aiEnabled: false });
    prisma.aiBusinessProfile.findUnique.mockResolvedValueOnce({ aiEnabled: true });
    const repo = new PrismaAiAvailabilityRepository(prisma as never);

    expect(await repo.isEnabled('tenant-1', 'sessao-a')).toBe(false);
    expect(await repo.isEnabled('tenant-1', 'sessao-b')).toBe(true);
  });
});
