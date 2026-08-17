import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';
import { PrismaContactRepository } from '../../src/services/contacts/infrastructure/repositories/PrismaContactRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase L, Bloco L3 — a materialização de elegibilidade contra um Postgres
 * REAL. Mesmo espírito de `contactIdentity.integration.test.ts`: as três
 * regras de supressão dependem de um JOIN entre `whatsapp_contacts`,
 * `whatsapp_conversations` e `campaign_recipients` — um Fake nunca provaria
 * que o filtro (`status=HUMAN` + `assignedToUserId` preenchido; janela de 7
 * dias por `sentAt`) está correto contra o schema real.
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — elegibilidade de campanha (Fase L, Bloco L3)', () => {
  let prisma: PrismaClient;
  let campaignRepository: PrismaCampaignRepository;
  let contactRepository: PrismaContactRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-campaigns-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste L3' } });
    } catch {
      databaseAvailable = false;
    }
    campaignRepository = new PrismaCampaignRepository(prisma);
    contactRepository = new PrismaContactRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('contato sem nenhuma condição é elegível (nenhuma flag marcada)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000001',
      source: 'whatsapp',
    });

    const eligibility = await campaignRepository.fetchEligibility(tenantId, [contato.id]);

    expect(eligibility.get(contato.id)).toEqual({
      optedOut: false,
      hasActiveHumanConversation: false,
      recentlyContactedByCampaign: false,
    });
  });

  it('contato com optOutAt é sinalizado optedOut', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000002',
      source: 'whatsapp',
    });
    await contactRepository.setOptOutAt(tenantId, contato.id, new Date());

    const eligibility = await campaignRepository.fetchEligibility(tenantId, [contato.id]);

    expect(eligibility.get(contato.id)?.optedOut).toBe(true);
  });

  it('contato com conversa HUMAN e dono é sinalizado — conversa HUMAN sem dono NÃO é', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const comDono = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000003',
      source: 'whatsapp',
    });
    await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'integration-test-l3',
        contactJid: '5521900000003@s.whatsapp.net',
        contactId: comDono.id,
        status: 'HUMAN',
        assignedToUserId: 'user-de-teste',
      },
    });

    const semDono = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000004',
      source: 'whatsapp',
    });
    await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'integration-test-l3',
        contactJid: '5521900000004@s.whatsapp.net',
        contactId: semDono.id,
        status: 'HUMAN',
        assignedToUserId: null,
      },
    });

    const eligibility = await campaignRepository.fetchEligibility(tenantId, [
      comDono.id,
      semDono.id,
    ]);

    expect(eligibility.get(comDono.id)?.hasActiveHumanConversation).toBe(true);
    expect(eligibility.get(semDono.id)?.hasActiveHumanConversation).toBe(false);
  });

  it('contato SENT há menos de 7 dias por outra campanha é sinalizado — SENT há mais de 7 dias NÃO é', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const recente = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000005',
      source: 'whatsapp',
    });
    const antigo = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000006',
      source: 'whatsapp',
    });

    const outraCampanha = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l3',
      name: 'Campanha anterior',
      messageTemplate: 'Oi',
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await prisma.campaignRecipient.create({
      data: {
        tenantId,
        campaignId: outraCampanha.id,
        contactId: recente.id,
        status: 'SENT',
        sentAt: twoDaysAgo,
      },
    });
    await prisma.campaignRecipient.create({
      data: {
        tenantId,
        campaignId: outraCampanha.id,
        contactId: antigo.id,
        status: 'SENT',
        sentAt: tenDaysAgo,
      },
    });

    const eligibility = await campaignRepository.fetchEligibility(tenantId, [
      recente.id,
      antigo.id,
    ]);

    expect(eligibility.get(recente.id)?.recentlyContactedByCampaign).toBe(true);
    expect(eligibility.get(antigo.id)?.recentlyContactedByCampaign).toBe(false);
  });

  it('materializar duas vezes a mesma campanha não duplica destinatário (constraint @@unique)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000007',
      source: 'whatsapp',
    });
    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l3',
      name: 'Campanha idempotência',
      messageTemplate: 'Oi',
    });

    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: contato.id, status: 'pending' },
    ]);
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: contato.id, status: 'pending' },
    ]);

    const total = await prisma.campaignRecipient.count({
      where: { tenantId, campaignId: campanha.id },
    });
    expect(total).toBe(1);
  });

  it('apagar a campanha apaga os destinatários (onDelete: Cascade)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000008',
      source: 'whatsapp',
    });
    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l3',
      name: 'Campanha a apagar',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: contato.id, status: 'pending' },
    ]);

    await prisma.campaign.delete({ where: { id: campanha.id } });

    const total = await prisma.campaignRecipient.count({
      where: { tenantId, campaignId: campanha.id },
    });
    expect(total).toBe(0);
  });
});
