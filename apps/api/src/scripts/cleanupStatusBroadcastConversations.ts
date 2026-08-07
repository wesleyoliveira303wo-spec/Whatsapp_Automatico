import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Script de LIMPEZA pontual (uso manual, não faz parte do runtime) — HOTFIX
 * 2026-07-31 (ver `DECISIONS.md` ADR #93).
 *
 * Contexto: até este hotfix, Status (Stories) publicados por contatos
 * chegavam com `key.remoteJid === 'status@broadcast'` e criavam uma
 * `WhatsAppConversation` fantasma — todos os Status de todas as pessoas
 * colapsados numa ÚNICA conversa (a chave da conversa é o `contactJid`).
 * O filtro no `BaileysProvider` impede que NOVAS sejam criadas, mas não
 * remove as que já foram persistidas antes da correção.
 *
 * Este script apaga essas conversas fantasma (qualquer `contact_jid`
 * terminado em `@broadcast`, o que cobre `status@broadcast` e listas de
 * transmissão). As `WhatsAppMessage` associadas somem junto por
 * `onDelete: Cascade` já declarado no schema — não precisa apagá-las à mão.
 *
 * Rodar (na raiz do monorepo ou em apps/api):
 *   npx tsx apps/api/src/scripts/cleanupStatusBroadcastConversations.ts
 *
 * Por segurança, roda em modo SIMULAÇÃO por padrão (só mostra o que seria
 * apagado). Para apagar de verdade, passe `--apply`:
 *   npx tsx apps/api/src/scripts/cleanupStatusBroadcastConversations.ts --apply
 *
 * Mesmo caminho de `.env` dos outros scripts desta pasta.
 */
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    const suspects = await prisma.whatsAppConversation.findMany({
      where: { contactJid: { endsWith: '@broadcast' } },
      select: {
        id: true,
        tenantId: true,
        sessionName: true,
        contactJid: true,
        contactName: true,
        createdAt: true,
      },
    });

    if (suspects.length === 0) {
      console.log('Nenhuma conversa de broadcast/Status encontrada — nada a limpar.');
      return;
    }

    console.log(`Encontradas ${suspects.length} conversa(s) de broadcast/Status:`);
    for (const conversation of suspects) {
      const messageCount = await prisma.whatsAppMessage.count({
        where: { conversationId: conversation.id },
      });
      console.log(
        `  - ${conversation.contactJid} (sessão "${conversation.sessionName}", nome exibido: ${
          conversation.contactName ?? '—'
        }, ${messageCount} mensagem(ns), criada em ${conversation.createdAt.toISOString()})`,
      );
    }

    if (!apply) {
      console.log('\nMODO SIMULAÇÃO — nada foi apagado.');
      console.log('Para apagar de verdade, rode de novo com --apply no final do comando.');
      return;
    }

    const deleted = await prisma.whatsAppConversation.deleteMany({
      where: { contactJid: { endsWith: '@broadcast' } },
    });
    console.log(
      `\n${deleted.count} conversa(s) apagada(s) (mensagens associadas removidas por cascade).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao limpar conversas de Status:', error);
  process.exit(1);
});
