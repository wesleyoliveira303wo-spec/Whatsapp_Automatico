import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';
import { PrismaContactRepository } from '../../src/services/contacts/infrastructure/repositories/PrismaContactRepository';
import { PrismaConversationRepository } from '../../src/services/conversations/infrastructure/repositories/PrismaConversationRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase L, Bloco L4 — o motor de envio contra um Postgres REAL. Mesmo espírito
 * de `campaignEligibility.integration.test.ts` (L3): prova as garantias que
 * dependem do SCHEMA real (constraint `@@unique`, índices, contagem por
 * `attemptedAt`), não só do Fake em memória. Pula (não falha) se o Postgres
 * não estiver de pé.
 */
describe('Integração real — motor de envio de campanha (Fase L, Bloco L4)', () => {
  let prisma: PrismaClient;
  let campaignRepository: PrismaCampaignRepository;
  let contactRepository: PrismaContactRepository;
  let conversationRepository: PrismaConversationRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-campaign-send-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste L4' } });
    } catch {
      databaseAvailable = false;
    }
    campaignRepository = new PrismaCampaignRepository(prisma);
    contactRepository = new PrismaContactRepository(prisma);
    conversationRepository = new PrismaConversationRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('findByContactAndSession encontra a conversa da sessão certa, e só ela', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000101',
      source: 'whatsapp',
    });
    const conversaA = await conversationRepository.upsertByTenantSessionAndContact(
      tenantId,
      'sessao-a',
      '5521900000101@s.whatsapp.net',
      {
        id: 'conversa-sessao-a',
        tenantId,
        sessionName: 'sessao-a',
        contactJid: '5521900000101@s.whatsapp.net',
        status: 'bot',
        unreadCount: 0,
        stage: 'new',
        stageSetBy: 'ai',
        stageUpdatedAt: new Date(),
        excludedFromPipeline: false,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    // `contactId` não é gravado na criação (mesmo comportamento real de
    // `MessageIngestionService`) — o vínculo é um passo SEPARADO.
    await conversationRepository.linkContact(tenantId, conversaA.id, contato.id);

    const encontrada = await conversationRepository.findByContactAndSession(
      tenantId,
      'sessao-a',
      contato.id,
    );
    const naoEncontrada = await conversationRepository.findByContactAndSession(
      tenantId,
      'sessao-b',
      contato.id,
    );

    expect(encontrada?.id).toBe(conversaA.id);
    expect(naoEncontrada).toBeUndefined();
  });

  it('updateCampaignStatus muda o status e limpa pausedReason ao sair de PAUSED', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha de teste',
      messageTemplate: 'Oi',
    });

    const paused = await campaignRepository.updateCampaignStatus(
      tenantId,
      campanha.id,
      'paused',
      'daily_limit_reached',
    );
    expect(paused?.status).toBe('paused');
    expect(paused?.pausedReason).toBe('daily_limit_reached');

    const resumed = await campaignRepository.updateCampaignStatus(tenantId, campanha.id, 'running');
    expect(resumed?.status).toBe('running');
    expect(resumed?.pausedReason).toBeUndefined();
  });

  it('countSentToday conta só SENT de HOJE, não FAILED nem SENT de outro dia', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha teto diário',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-a', status: 'pending' },
      { contactId: 'contact-b', status: 'pending' },
      { contactId: 'contact-c', status: 'pending' },
    ]);
    const [a, b, c] = (await campaignRepository.listPendingRecipients(tenantId, campanha.id)).map(
      (r) => r.id,
    );

    await campaignRepository.markRecipientSent(tenantId, a, {
      attemptedAt: new Date(),
      conversationId: 'conversa-x',
    });
    await campaignRepository.markRecipientFailed(tenantId, b, {
      attemptedAt: new Date(),
      errorMessage: 'erro',
    });
    // SENT de ONTEM não deve contar no teto de HOJE.
    await prisma.campaignRecipient.update({
      where: { id: c },
      data: {
        status: 'SENT',
        sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        attemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const sentToday = await campaignRepository.countSentToday(tenantId, campanha.id);
    expect(sentToday).toBe(1);
  });

  it('listRecentOutcomes ordena por attemptedAt DESC e ignora PENDING/SKIPPED', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha disjuntor',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-d', status: 'pending' },
      { contactId: 'contact-e', status: 'pending' },
      { contactId: 'contact-f', status: 'skipped', skipReason: 'opt_out' },
    ]);
    const recipients = await campaignRepository.listPendingRecipients(tenantId, campanha.id);
    const [d, e] = recipients.map((r) => r.id);

    const earlier = new Date(Date.now() - 10_000);
    const later = new Date(Date.now() - 1_000);
    await campaignRepository.markRecipientFailed(tenantId, d, {
      attemptedAt: earlier,
      errorMessage: 'erro',
    });
    await campaignRepository.markRecipientSent(tenantId, e, {
      attemptedAt: later,
      conversationId: 'conversa-y',
    });

    const outcomes = await campaignRepository.listRecentOutcomes(tenantId, campanha.id, 10);

    // Mais recente primeiro: `sent` (later) antes de `failed` (earlier); SKIPPED nunca aparece.
    expect(outcomes).toEqual(['sent', 'failed']);
  });

  it('constraint @@unique([campaignId, contactId]) sobrevive a duas materializações concorrentes', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha concorrência',
      messageTemplate: 'Oi',
    });

    await Promise.all([
      campaignRepository.createRecipients(tenantId, campanha.id, [
        { contactId: 'contact-concorrente', status: 'pending' },
      ]),
      campaignRepository.createRecipients(tenantId, campanha.id, [
        { contactId: 'contact-concorrente', status: 'pending' },
      ]),
    ]);

    const total = await prisma.campaignRecipient.count({
      where: { tenantId, campaignId: campanha.id, contactId: 'contact-concorrente' },
    });
    expect(total).toBe(1);
  });
});
