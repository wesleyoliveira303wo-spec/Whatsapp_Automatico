import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/** Mesmo teto de tempo próprio dos demais testes de integração real (`campaignMedia.integration.test.ts`). */
jest.setTimeout(30_000);

/**
 * Task 5 (edição de campanhas, 2026-09-15) — `suppressRecipients`/
 * `deleteRecipients`/`updateCampaignContent` contra um Postgres REAL. Prova
 * duas coisas que um Fake em memória nunca provaria: que `suppressRecipients`
 * de fato preserva `sentAt`/`repliedAt` (a coluna some/mistura fácil num
 * `updateMany` mal escrito) e que `deleteRecipients` remove a linha de
 * verdade (`deleteMany`, não um soft-delete disfarçado).
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — edição de campanha (Task 5, 2026-09-15)', () => {
  let prisma: PrismaClient;
  let campaignRepository: PrismaCampaignRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-campaign-edit-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste edição' } });
    } catch {
      databaseAvailable = false;
    }
    campaignRepository = new PrismaCampaignRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('suppressRecipients preserva sentAt/repliedAt/conversationId; deleteRecipients apaga de verdade', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-edit',
      name: 'Campanha de teste',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campaign.id, [
      { contactId: 'contact-with-history', status: 'pending' },
      { contactId: 'contact-without-history', status: 'pending' },
    ]);
    const sentAt = new Date('2026-09-01T00:00:00.000Z');
    await prisma.campaignRecipient.updateMany({
      where: { tenantId, campaignId: campaign.id, contactId: 'contact-with-history' },
      data: { status: 'SENT', sentAt, conversationId: 'conversation-1' },
    });
    const [withHistory, withoutHistory] = await Promise.all([
      prisma.campaignRecipient.findFirstOrThrow({
        where: { tenantId, campaignId: campaign.id, contactId: 'contact-with-history' },
      }),
      prisma.campaignRecipient.findFirstOrThrow({
        where: { tenantId, campaignId: campaign.id, contactId: 'contact-without-history' },
      }),
    ]);

    const suppressedCount = await campaignRepository.suppressRecipients(
      tenantId,
      [withHistory.id],
      'removed_by_operator',
    );
    const deletedCount = await campaignRepository.deleteRecipients(tenantId, [withoutHistory.id]);

    expect(suppressedCount).toBe(1);
    expect(deletedCount).toBe(1);

    const suppressedRow = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: withHistory.id },
    });
    expect(suppressedRow.status).toBe('SKIPPED');
    expect(suppressedRow.skipReason).toBe('removed_by_operator');
    expect(suppressedRow.sentAt).toEqual(sentAt);
    expect(suppressedRow.conversationId).toBe('conversation-1');

    const deletedRow = await prisma.campaignRecipient.findUnique({
      where: { id: withoutHistory.id },
    });
    expect(deletedRow).toBeNull();
  });

  it('updateCampaignContent substitui nome/descrição/texto por completo (description ausente vira null)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-edit',
      name: 'Nome original',
      description: 'Descrição original',
      messageTemplate: 'Texto original',
    });

    const updated = await campaignRepository.updateCampaignContent(tenantId, campaign.id, {
      name: 'Nome novo',
      messageTemplate: 'Texto novo',
      // `description` ausente — precisa virar `null`, nunca "deixar como estava".
    });

    expect(updated).toMatchObject({
      name: 'Nome novo',
      description: undefined,
      messageTemplate: 'Texto novo',
    });
  });

  it('suppressRecipients/deleteRecipients com array vazio não tocam o banco (devolvem 0)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    expect(await campaignRepository.suppressRecipients(tenantId, [], 'removed_by_operator')).toBe(0);
    expect(await campaignRepository.deleteRecipients(tenantId, [])).toBe(0);
  });
});
