import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Script de limpeza pontual — conversas com `contact_jid` no formato LID
 * (`@lid`), criadas antes do fix de 2026-08-01 que passou a usar `remoteJidAlt`
 * para resolver o número real do destinatário.
 *
 * Uso:
 *   # modo simulação (não apaga nada, só mostra o que seria apagado):
 *   npx ts-node -e "require('./src/scripts/cleanupLidConversations')"
 *   -- OU --
 *   npx ts-node src/scripts/cleanupLidConversations.ts
 *
 *   # modo real (apaga de fato):
 *   npx ts-node src/scripts/cleanupLidConversations.ts --apply
 *
 * As mensagens associadas somem junto por `onDelete: Cascade` no schema —
 * não é necessário apagá-las à mão.
 */

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const dryRun = !process.argv.includes('--apply');

async function main(): Promise<void> {
  console.log(
    dryRun
      ? '=== MODO SIMULAÇÃO (passe --apply para apagar de fato) ==='
      : '=== MODO REAL — apagando conversas LID ===',
  );

  const conversations = await prisma.whatsAppConversation.findMany({
    where: { contactJid: { endsWith: '@lid' } },
    select: { id: true, tenantId: true, sessionName: true, contactJid: true, contactName: true },
    orderBy: { createdAt: 'asc' },
  });

  if (conversations.length === 0) {
    console.log('Nenhuma conversa com @lid encontrada. Nada a fazer.');
    return;
  }

  console.log(
    `\nEncontradas ${conversations.length} conversa(s) com contact_jid terminado em @lid:\n`,
  );
  for (const c of conversations) {
    const name = c.contactName ?? c.contactJid;
    console.log(`  [${c.id}] sessão="${c.sessionName}" contato="${name}" (${c.contactJid})`);
  }

  if (dryRun) {
    console.log('\nSimulação concluída. Nada foi alterado.');
    console.log('Para apagar, rode: npx ts-node src/scripts/cleanupLidConversations.ts --apply');
    return;
  }

  const ids = conversations.map((c) => c.id);
  const { count } = await prisma.whatsAppConversation.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`\n✓ ${count} conversa(s) apagada(s) (mensagens removidas por cascade).`);
}

main()
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
