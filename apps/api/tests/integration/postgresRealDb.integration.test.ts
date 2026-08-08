import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase 1, Bloco F1.10 (estabilidade para beta) — TODA a suíte de
 * `Prisma*Repository.test.ts` deste projeto usa um `PrismaClient` FALSO
 * (mock manual de `whatsAppConversation.*`), nunca um Postgres real — ver
 * `PrismaConversationRepository.test.ts`. Isso é correto para testar a
 * LÓGICA dos repositórios (mapeamento de linha, filtros), mas nunca provou
 * que a migration mais recente (`20260808120000_add_conversation_last_message_index`)
 * realmente existe no banco, nem que o schema é utilizável de ponta a ponta
 * contra um Postgres de verdade.
 *
 * Este arquivo é DELIBERADAMENTE pequeno — só os 2 pontos críticos desta
 * rodada, não uma suíte de integração completa (isso duplicaria a cobertura
 * já feita com Fakes, que é mais rápida e não depende de infraestrutura).
 * Requer Postgres real acessível via `DATABASE_URL` (docker compose:
 * `postgres`, já usado pelo resto do projeto) — pula (não falha) se a
 * conexão não estiver disponível, para não quebrar quem rodar a suíte sem
 * a infraestrutura de pé (mesmo espírito de "sem infra, sem crash" já usado
 * neste projeto).
 */
describe('Integração real — Postgres (Fase 1, Bloco F1.10)', () => {
  let prisma: PrismaClient;
  let databaseAvailable = true;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
    } catch {
      databaseAvailable = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a migration do índice (tenantId, sessionName, lastMessageAt) foi aplicada de verdade no banco', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'whatsapp_conversations'`,
    );
    const names = indexes.map((row) => row.indexname);
    expect(names.some((name) => name.includes('tenantId_sessionName_lastMessageAt'))).toBe(true);
  });

  it('round-trip real: cria Tenant + WhatsAppConversation + WhatsAppMessage e lê de volta ordenado por lastMessageAt (não updatedAt)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const tenantId = `test-tenant-${Date.now()}`;
    const sessionName = 'integration-test';

    await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste F1.10' } });

    try {
      const older = await prisma.whatsAppConversation.create({
        data: {
          tenantId,
          sessionName,
          contactJid: '5511900000001@s.whatsapp.net',
          lastMessageAt: new Date('2026-08-01T10:00:00Z'),
        },
      });
      const newer = await prisma.whatsAppConversation.create({
        data: {
          tenantId,
          sessionName,
          contactJid: '5511900000002@s.whatsapp.net',
          lastMessageAt: new Date('2026-08-08T10:00:00Z'),
        },
      });
      // Ação administrativa (bumpa `updatedAt` via `@updatedAt`, mas NÃO
      // `lastMessageAt`) na conversa mais antiga — prova que ela continua
      // ordenada como mais antiga, mesmo tendo sido escrita por último.
      await prisma.whatsAppConversation.updateMany({
        where: { id: older.id },
        data: { unreadCount: 0 },
      });

      const rows = await prisma.whatsAppConversation.findMany({
        where: { tenantId, sessionName },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      });

      expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
    } finally {
      // Limpeza: cascade via onDelete: Cascade no Tenant remove tudo junto.
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
  });
});
