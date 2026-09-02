import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { deleteTenantData, countTenantData } from '../../src/scripts/deleteTenant';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * T7 (Lançamento suave) — `deleteTenant` contra um Postgres REAL.
 *
 * A garantia que importa ("apagar um tenant não deixa NENHUMA linha órfã em
 * nenhuma tabela relacionada") só se prova contra o banco de verdade, com as
 * FKs `ON DELETE CASCADE` reais. Um Fake em memória nunca provaria isso.
 *
 * Pula (não falha) se o Postgres não estiver de pé — mesmo contrato dos
 * demais testes de integração. A ausência do aviso "Postgres indisponível"
 * na saída é o que confirma que ele de fato rodou.
 */
describe('Integração real — deleteTenant (T7)', () => {
  let prisma: PrismaClient;
  let databaseAvailable = true;
  const tenantId = `test-tenant-delete-${Date.now()}`;
  const sessionName = 'sessao-teste';
  const userId = `${tenantId}-user`;
  const conversationId = `${tenantId}-conv`;
  const campaignId = `${tenantId}-camp`;
  const tagId = `${tenantId}-tag`;
  const contactId = `${tenantId}-contact`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste T7' } });
    } catch {
      databaseAvailable = false;
      return;
    }

    // Grafo completo: uma linha em cada tabela que `deleteTenant` varre.
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${tenantId}@example.test`,
        passwordHash: 'hash',
        role: 'OWNER',
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: `${tenantId}-rt`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await prisma.whatsAppSession.create({ data: { tenantId, sessionName } });
    await prisma.whatsAppSessionEvent.create({
      data: { tenantId, sessionName, status: 'DISCONNECTED', occurredAt: new Date() },
    });
    await prisma.tenantCredential.create({
      data: { tenantId, namespace: 'ns', key: 'k', value: 'v' },
    });
    await prisma.whatsAppContact.create({
      data: { id: contactId, tenantId, phoneE164: '5521999990000' },
    });
    await prisma.contactConsentEvent.create({
      data: { tenantId, contactId, type: 'OPT_OUT', reason: 'teste' },
    });
    await prisma.whatsAppConversation.create({
      data: { id: conversationId, tenantId, sessionName, contactJid: '5521999990000@s.whatsapp.net', contactId },
    });
    await prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId,
        direction: 'INBOUND',
        content: 'oi',
        occurredAt: new Date(),
      },
    });
    await prisma.aiInteraction.create({
      data: {
        tenantId,
        conversationId,
        provider: 'GEMINI',
        promptVersion: 'v1',
        tokensInput: 1,
        tokensOutput: 1,
        costUsd: '0',
        latencyMs: 1,
        status: 'SUCCESS',
      },
    });
    await prisma.whatsAppTag.create({
      data: { id: tagId, tenantId, sessionName, name: 'quente' },
    });
    await prisma.whatsAppConversationTag.create({ data: { conversationId, tagId } });
    await prisma.campaign.create({
      data: { id: campaignId, tenantId, sessionName, name: 'C', messageTemplate: 'oi' },
    });
    await prisma.campaignRecipient.create({
      data: { tenantId, campaignId, contactId },
    });
    await prisma.aiBusinessProfile.create({ data: { tenantId, sessionName, content: 'x' } });
    await prisma.aiPreferences.create({ data: { tenantId, sessionName } });
    await prisma.aiFaqEntry.create({
      data: { tenantId, sessionName, question: 'q', answer: 'a' },
    });
    await prisma.quickReply.create({ data: { tenantId, sessionName, content: 'c' } });
    await prisma.auditLog.create({ data: { tenantId, action: 'test.event' } });
  });

  afterAll(async () => {
    if (databaseAvailable) {
      // Se o teste falhou antes do delete, isto limpa; se passou, é no-op.
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('countTenantData enxerga o grafo semeado antes de apagar', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const { counts, total } = await countTenantData(prisma, tenantId);
    expect(counts['Mensagens']).toBe(1);
    expect(counts['Usuários']).toBe(1);
    expect(counts['Refresh tokens']).toBe(1);
    expect(counts['Vínculos conversa-tag']).toBe(1);
    expect(counts['Destinatários de campanha']).toBe(1);
    expect(total).toBeGreaterThanOrEqual(19);
  });

  it('deleteTenantData apaga o tenant e não deixa NENHUMA linha órfã', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const report = await deleteTenantData(prisma, tenantId);
    expect(report.total).toBeGreaterThanOrEqual(19);

    // O tenant sumiu.
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();

    // Zero linha em cada tabela relacionada.
    expect(await prisma.user.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { user: { tenantId } } })).toBe(0);
    expect(await prisma.whatsAppSession.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.whatsAppSessionEvent.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.tenantCredential.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.whatsAppContact.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.contactConsentEvent.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.whatsAppConversation.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.whatsAppMessage.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.aiInteraction.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.whatsAppTag.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.whatsAppConversationTag.count({ where: { conversation: { tenantId } } }),
    ).toBe(0);
    expect(await prisma.campaign.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.campaignRecipient.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.aiBusinessProfile.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.aiPreferences.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.aiFaqEntry.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.quickReply.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(0);
  });
});
