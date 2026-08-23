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

  it('resetFailedRecipientsToPending (retrofit 2026-08-18 — reabrir campanha) devolve só FAILED, nunca SKIPPED', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha reabertura',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-falhou-1', status: 'pending' },
      { contactId: 'contact-falhou-2', status: 'pending' },
      { contactId: 'contact-enviado', status: 'pending' },
      { contactId: 'contact-opt-out', status: 'skipped', skipReason: 'opt_out' },
    ]);
    const pendentes = await campaignRepository.listPendingRecipients(tenantId, campanha.id);
    const falhou1 = pendentes.find((r) => r.contactId === 'contact-falhou-1')!.id;
    const falhou2 = pendentes.find((r) => r.contactId === 'contact-falhou-2')!.id;
    const enviado = pendentes.find((r) => r.contactId === 'contact-enviado')!.id;

    await campaignRepository.markRecipientFailed(tenantId, falhou1, {
      attemptedAt: new Date(),
      errorMessage: 'WhatsAppNotConnectedError',
    });
    await campaignRepository.markRecipientFailed(tenantId, falhou2, {
      attemptedAt: new Date(),
      errorMessage: 'timeout',
    });
    await campaignRepository.markRecipientSent(tenantId, enviado, {
      attemptedAt: new Date(),
      conversationId: 'conversa-x',
    });

    const resetCount = await campaignRepository.resetFailedRecipientsToPending(
      tenantId,
      campanha.id,
    );
    expect(resetCount).toBe(2);

    const aindaPendentes = await campaignRepository.listPendingRecipients(tenantId, campanha.id);
    expect(aindaPendentes.map((r) => r.contactId).sort()).toEqual([
      'contact-falhou-1',
      'contact-falhou-2',
    ]);
    const falhou1Depois = await campaignRepository.findRecipientById(tenantId, falhou1);
    expect(falhou1Depois?.errorMessage).toBeUndefined();
    // SENT e SKIPPED continuam intocados — reabrir nunca burla opt-out nem desfaz um envio real.
    const enviadoDepois = await campaignRepository.findRecipientById(tenantId, enviado);
    expect(enviadoDepois?.status).toBe('sent');
    const optOutDepois = (await campaignRepository.listRecipients(tenantId, campanha.id, {
      limit: 10,
      status: 'skipped',
    })).recipients;
    expect(optOutDepois).toHaveLength(1);
    expect(optOutDepois[0].skipReason).toBe('opt_out');
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

  // --- Fase L, Bloco L6 (marca REPLIED + IA reconhece origem de campanha) ---

  it('markRepliedByConversationId marca REPLIED só quem estava SENT para aquela conversa', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha L6',
      messageTemplate: 'Olá! Promoção especial para você.',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-respondeu', status: 'pending' },
      { contactId: 'contact-outra-conversa', status: 'pending' },
    ]);
    const [respondeu, outraConversa] = await campaignRepository.listPendingRecipients(
      tenantId,
      campanha.id,
    );
    await campaignRepository.markRecipientSent(tenantId, respondeu.id, {
      attemptedAt: new Date(),
      conversationId: 'conversa-que-respondeu',
    });
    await campaignRepository.markRecipientSent(tenantId, outraConversa.id, {
      attemptedAt: new Date(),
      conversationId: 'conversa-outra',
    });

    await campaignRepository.markRepliedByConversationId(tenantId, 'conversa-que-respondeu');

    const marcado = await campaignRepository.findRecipientById(tenantId, respondeu.id);
    const naoMarcado = await campaignRepository.findRecipientById(tenantId, outraConversa.id);
    expect(marcado?.status).toBe('replied');
    expect(marcado?.repliedAt).toBeInstanceOf(Date);
    expect(naoMarcado?.status).toBe('sent');
  });

  it('markRepliedByConversationId é idempotente — chamar de novo não lança nem duplica efeito', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha L6 idempotência',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-idempotente', status: 'pending' },
    ]);
    const [recipient] = await campaignRepository.listPendingRecipients(tenantId, campanha.id);
    await campaignRepository.markRecipientSent(tenantId, recipient.id, {
      attemptedAt: new Date(),
      conversationId: 'conversa-idempotente',
    });

    await campaignRepository.markRepliedByConversationId(tenantId, 'conversa-idempotente');
    await campaignRepository.markRepliedByConversationId(tenantId, 'conversa-idempotente');

    const marcado = await campaignRepository.findRecipientById(tenantId, recipient.id);
    expect(marcado?.status).toBe('replied');
  });

  it('findOriginByConversationId devolve o texto da campanha MAIS RECENTE (SENT/REPLIED) para aquela conversa', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanhaAntiga = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha antiga',
      messageTemplate: 'Mensagem antiga',
    });
    const campanhaRecente = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha recente',
      messageTemplate: 'Mensagem recente',
    });
    await campaignRepository.createRecipients(tenantId, campanhaAntiga.id, [
      { contactId: 'contact-origem', status: 'pending' },
    ]);
    await campaignRepository.createRecipients(tenantId, campanhaRecente.id, [
      { contactId: 'contact-origem', status: 'pending' },
    ]);
    const [antigoRecipient] = await campaignRepository.listPendingRecipients(
      tenantId,
      campanhaAntiga.id,
    );
    const [recenteRecipient] = await campaignRepository.listPendingRecipients(
      tenantId,
      campanhaRecente.id,
    );
    await campaignRepository.markRecipientSent(tenantId, antigoRecipient.id, {
      attemptedAt: new Date(Date.now() - 60_000),
      conversationId: 'conversa-origem',
    });
    await campaignRepository.markRecipientSent(tenantId, recenteRecipient.id, {
      attemptedAt: new Date(),
      conversationId: 'conversa-origem',
    });

    const origin = await campaignRepository.findOriginByConversationId(tenantId, 'conversa-origem');

    expect(origin).toEqual({ messageSent: 'Mensagem recente' });
  });

  it('findOriginByConversationId devolve undefined para conversa sem origem de campanha', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const origin = await campaignRepository.findOriginByConversationId(
      tenantId,
      'conversa-sem-campanha-nenhuma',
    );

    expect(origin).toBeUndefined();
  });

  // --- Fase L, Bloco L7 (métricas) ---

  it('getMetrics cruza campaign_recipients + whatsapp_conversations + ai_interactions contra o banco real', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha métricas',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: 'contact-metrica-converteu', status: 'pending' },
      { contactId: 'contact-metrica-nao-converteu', status: 'pending' },
    ]);
    const [converteu, naoConverteu] = await campaignRepository.listPendingRecipients(
      tenantId,
      campanha.id,
    );
    await campaignRepository.markRecipientSent(tenantId, converteu.id, {
      attemptedAt: new Date('2026-08-17T10:00:00.000Z'),
      conversationId: 'conversa-metrica-converteu',
    });
    await campaignRepository.markRecipientSent(tenantId, naoConverteu.id, {
      attemptedAt: new Date('2026-08-17T10:00:00.000Z'),
      conversationId: 'conversa-metrica-nao-converteu',
    });
    await campaignRepository.markRepliedByConversationId(tenantId, 'conversa-metrica-converteu');

    await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'sessao-a',
        contactJid: 'metrica-converteu@s.whatsapp.net',
        id: 'conversa-metrica-converteu',
        stage: 'CLOSED_WON',
      },
    });
    await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'sessao-a',
        contactJid: 'metrica-nao-converteu@s.whatsapp.net',
        id: 'conversa-metrica-nao-converteu',
        stage: 'NEGOTIATING',
        escalatedAt: new Date(),
      },
    });
    await prisma.aiInteraction.create({
      data: {
        tenantId,
        conversationId: 'conversa-metrica-converteu',
        provider: 'CLAUDE',
        promptVersion: 'v2',
        tokensInput: 100,
        tokensOutput: 50,
        costUsd: '0.01000000',
        latencyMs: 500,
        status: 'SUCCESS',
      },
    });
    await prisma.aiInteraction.create({
      data: {
        tenantId,
        conversationId: 'conversa-metrica-nao-converteu',
        provider: 'CLAUDE',
        promptVersion: 'v2',
        tokensInput: 100,
        tokensOutput: 50,
        costUsd: '0.02000000',
        latencyMs: 500,
        status: 'SUCCESS',
        escalationReason: 'UNKNOWN_ANSWER',
      },
    });

    const metrics = await campaignRepository.getMetrics(tenantId, campanha.id);

    expect(metrics).toMatchObject({
      total: 2,
      replied: 1,
      sent: 1,
      stageCounts: { closed_won: 1, negotiating: 1, new: 0, contacted: 0, closed_lost: 0 },
      escalatedCount: 1,
      conversionRate: 0.5,
      unknownAnswerCount: 1,
    });
    expect(metrics?.aiCostUsd).toBeCloseTo(0.03, 6);
    expect(metrics?.costPerConversionUsd).toBeCloseTo(0.03, 6);
  });

  it('getMetrics devolve undefined para campanha inexistente/de outro tenant', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const metrics = await campaignRepository.getMetrics(tenantId, 'campanha-fantasma');

    expect(metrics).toBeUndefined();
  });

  // --- Padronização de exibição de contato (2026-08-20) ---

  it('listRecipients resolve `contact` (nome salvo + telefone + apelido do WhatsApp) em lote, contra o banco real', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contatoComNome = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000301',
      name: 'Maria Salva',
      source: 'manual',
    });
    const contatoSemNome = await contactRepository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521900000302',
      source: 'whatsapp',
    });
    await conversationRepository.upsertByTenantSessionAndContact(
      tenantId,
      'sessao-a',
      '5521900000302@s.whatsapp.net',
      {
        id: 'conversa-contact-info-sem-nome',
        tenantId,
        sessionName: 'sessao-a',
        contactJid: '5521900000302@s.whatsapp.net',
        contactName: 'Apelido do WhatsApp',
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

    const campanha = await campaignRepository.create({
      tenantId,
      sessionName: 'sessao-a',
      name: 'Campanha exibição de contato',
      messageTemplate: 'Oi',
    });
    await campaignRepository.createRecipients(tenantId, campanha.id, [
      { contactId: contatoComNome.id, status: 'pending' },
      { contactId: contatoSemNome.id, status: 'pending' },
      { phoneE164: '5521900000399', name: 'Nome da planilha', status: 'pending' },
    ]);

    const pendentes = await campaignRepository.listPendingRecipients(tenantId, campanha.id);
    const semNomeRecipient = pendentes.find((r) => r.contactId === contatoSemNome.id)!;
    // Só um destinatário com CONVERSA VINCULADA tem apelido a resolver — mesmo
    // caminho real (o `conversationId` só existe depois de um envio).
    await campaignRepository.markRecipientSent(tenantId, semNomeRecipient.id, {
      attemptedAt: new Date(),
      conversationId: 'conversa-contact-info-sem-nome',
    });

    const { recipients } = await campaignRepository.listRecipients(tenantId, campanha.id, {
      limit: 10,
    });

    const comNome = recipients.find((r) => r.contactId === contatoComNome.id);
    const semNome = recipients.find((r) => r.contactId === contatoSemNome.id);
    const solto = recipients.find((r) => r.phoneE164 === '5521900000399');

    // Contato com nome salvo: `contact.name` presente, sem apelido (nunca
    // enviado, sem conversa vinculada).
    expect(comNome?.contact).toEqual({
      name: 'Maria Salva',
      phoneE164: '5521900000301',
      nickname: undefined,
    });
    // Contato SEM nome salvo, mas com conversa vinculada: `contact.name`
    // ausente, `contact.nickname` resolvido da conversa — é este par que
    // corrige o bug original (mostrava o `contactId` cru).
    expect(semNome?.contact).toEqual({
      name: undefined,
      phoneE164: '5521900000302',
      nickname: 'Apelido do WhatsApp',
    });
    // Destinatário "solto" (planilha, sem Contato): nunca ganha `contact`.
    expect(solto?.contact).toBeUndefined();
    expect(solto?.name).toBe('Nome da planilha');
  });
});
