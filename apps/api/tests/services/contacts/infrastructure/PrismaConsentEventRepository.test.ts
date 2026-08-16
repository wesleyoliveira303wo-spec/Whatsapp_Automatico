import { PrismaConsentEventRepository } from '../../../../src/services/contacts/infrastructure/repositories/PrismaConsentEventRepository';

function createFakePrisma(): { contactConsentEvent: { create: jest.Mock } } {
  return { contactConsentEvent: { create: jest.fn() } };
}

const SAMPLE_ROW = {
  id: 'consent-1',
  tenantId: 'tenant-1',
  contactId: 'contact-1',
  type: 'OPT_OUT',
  reason: 'palavra-chave',
  actorUserId: null as string | null,
  occurredAt: new Date('2026-08-16T00:00:00Z'),
};

describe('PrismaConsentEventRepository (Fase L, Bloco L2)', () => {
  it('cria o evento com os campos informados', async () => {
    const prisma = createFakePrisma();
    prisma.contactConsentEvent.create.mockResolvedValue(SAMPLE_ROW);
    const repo = new PrismaConsentEventRepository(prisma as never);

    await repo.record({
      tenantId: 'tenant-1',
      contactId: 'contact-1',
      type: 'opt_out',
      reason: 'palavra-chave',
    });

    expect(prisma.contactConsentEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        contactId: 'contact-1',
        type: 'OPT_OUT',
        reason: 'palavra-chave',
        actorUserId: null,
      },
    });
  });

  it('mapeia type enum (Domain <-> Prisma) nos dois sentidos', async () => {
    const prisma = createFakePrisma();
    prisma.contactConsentEvent.create.mockResolvedValue({ ...SAMPLE_ROW, type: 'OPT_IN' });
    const repo = new PrismaConsentEventRepository(prisma as never);

    const result = await repo.record({
      tenantId: 'tenant-1',
      contactId: 'contact-1',
      type: 'opt_in',
    });

    expect(result.type).toBe('opt_in');
  });

  it('converte reason/actorUserId null do banco para undefined no Domain', async () => {
    const prisma = createFakePrisma();
    prisma.contactConsentEvent.create.mockResolvedValue(SAMPLE_ROW);
    const repo = new PrismaConsentEventRepository(prisma as never);

    const result = await repo.record({
      tenantId: 'tenant-1',
      contactId: 'contact-1',
      type: 'opt_out',
    });

    expect(result.actorUserId).toBeUndefined();
  });

  it('registra o actorUserId quando informado (ação manual)', async () => {
    const prisma = createFakePrisma();
    prisma.contactConsentEvent.create.mockResolvedValue({ ...SAMPLE_ROW, actorUserId: 'user-1' });
    const repo = new PrismaConsentEventRepository(prisma as never);

    await repo.record({
      tenantId: 'tenant-1',
      contactId: 'contact-1',
      type: 'opt_out',
      actorUserId: 'user-1',
    });

    expect(prisma.contactConsentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'user-1' }) }),
    );
  });
});
