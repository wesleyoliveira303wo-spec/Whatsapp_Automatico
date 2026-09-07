import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';
import { PrismaContactRepository } from '../../src/services/contacts/infrastructure/repositories/PrismaContactRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Teto de tempo próprio para testes que falam com infraestrutura REAL.
 *
 * Medido (2026-09-05), não chutado: o `beforeAll` destes arquivos leva ~5s
 * só para subir o motor de consulta do Prisma dentro do Jest no Windows —
 * ou seja, oscila EXATAMENTE em cima do teto padrão de 5s do Jest. O
 * resultado era uma suíte que passava numa execução e falhava na seguinte
 * sem nenhuma mudança de código, com uma mensagem ("Exceeded timeout ... for
 * a hook") que aponta para o teste em vez de para a causa. O padrão de 5s
 * nunca foi uma afirmação sobre estes testes; é só o default de um teste de
 * unidade.
 */
jest.setTimeout(30_000);


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

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      contato.id,
    ]);

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

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      contato.id,
    ]);

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

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      comDono.id,
      semDono.id,
    ]);

    expect(eligibility.get(comDono.id)?.hasActiveHumanConversation).toBe(true);
    expect(eligibility.get(semDono.id)?.hasActiveHumanConversation).toBe(false);
  });

  // Correção 2026-08-20 — achado real: um contato em atendimento humano no
  // WhatsApp A bloqueava campanha no WhatsApp B. "Conversa ativa com humano"
  // passou a ser escopada por sessão ("cada WhatsApp é uma empresa
  // independente", mesmo racional da navegação desde a M6H-1).
  it('conversa HUMAN com dono em OUTRA sessão NÃO bloqueia elegibilidade nesta sessão', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000010',
      source: 'whatsapp',
    });
    await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'integration-test-l3-outra-sessao',
        contactJid: '5521900000010@s.whatsapp.net',
        contactId: contato.id,
        status: 'HUMAN',
        assignedToUserId: 'user-de-teste',
      },
    });

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      contato.id,
    ]);

    expect(eligibility.get(contato.id)?.hasActiveHumanConversation).toBe(false);
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

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      recente.id,
      antigo.id,
    ]);

    expect(eligibility.get(recente.id)?.recentlyContactedByCampaign).toBe(true);
    expect(eligibility.get(antigo.id)?.recentlyContactedByCampaign).toBe(false);
  });

  // Correção 2026-08-20 — mesma lógica do teste de conversa HUMAN acima:
  // "contatado recentemente" só bloqueia dentro da MESMA sessão.
  it('SENT há menos de 7 dias por campanha de OUTRA sessão NÃO bloqueia elegibilidade nesta sessão', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000011',
      source: 'whatsapp',
    });
    const campanhaOutraSessao = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l3-outra-sessao',
      name: 'Campanha de outra sessão',
      messageTemplate: 'Oi',
    });
    await prisma.campaignRecipient.create({
      data: {
        tenantId,
        campaignId: campanhaOutraSessao.id,
        contactId: contato.id,
        status: 'SENT',
        sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    const eligibility = await campaignRepository.fetchEligibility(tenantId, 'integration-test-l3', [
      contato.id,
    ]);

    expect(eligibility.get(contato.id)?.recentlyContactedByCampaign).toBe(false);
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

  // Retrofit visual 2026-08-18 — `getSessionOverview` é a consulta mais
  // arriscada deste bloco: filtra `campaign_recipients` por um relacionamento
  // ANINHADO (`campaign: { sessionName }`), algo que nenhum outro método
  // deste repositório fazia até aqui. Um Fake nunca provaria que o Prisma
  // resolve esse JOIN corretamente contra o schema real.
  it('getSessionOverview() agrega status/enviados/respostas só da sessão pedida, via JOIN real', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const sessionName = `integration-overview-${Date.now()}`;
    const outraSessao = `${sessionName}-outra`;
    const contato = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000009',
      source: 'whatsapp',
    });

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName,
      name: 'Campanha da sessão certa',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: contato.id, status: 'pending' },
    ]);
    const [recipient] = (
      await campaignRepository.listRecipients(tenantId, campanha.id, { limit: 10 })
    ).recipients;
    await campaignRepository.markRecipientSent(tenantId, recipient.id, {
      attemptedAt: new Date(),
      conversationId: 'conv-fake',
    });

    // Campanha de OUTRA sessão do mesmo tenant — nunca deve entrar na conta.
    const campanhaOutraSessao = await campaignRepository.create({
      tenantId,
      sessionName: outraSessao,
      name: 'Campanha de outra sessão',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanhaOutraSessao.id, [
      { contactId: contato.id, status: 'pending' },
    ]);

    const overview = await campaignRepository.getSessionOverview(tenantId, sessionName);

    expect(overview.totalCampaigns).toBe(1);
    expect(overview.statusCounts.draft).toBe(1);
    expect(overview.totalSent).toBe(1);
    expect(overview.totalReplied).toBe(0);
  });
});
