import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Script de LIMPEZA pontual (uso manual, não faz parte do runtime) —
 * Reorganização Contatos/Campanhas (2026-08-17), pedido do fundador: remover
 * da base os contatos importados de planilha em testes anteriores (`source
 * = 'import'`).
 *
 * NÃO apaga histórico de conversa: `WhatsAppConversation.contactId` tem
 * `onDelete: SetNull` (a conversa perde o vínculo com o Contato, mas
 * continua existindo, com todas as mensagens). `CampaignRecipient` não tem
 * `@relation` para `WhatsAppContact` (sem FK) — recipients de campanhas já
 * materializadas nunca são afetados.
 *
 * Rodar (na raiz do monorepo ou em apps/api):
 *   npx tsx apps/api/src/scripts/cleanupImportedContacts.ts
 *
 * Por segurança, roda em modo SIMULAÇÃO por padrão (só lista quem seria
 * apagado). Para apagar de verdade, passe `--apply`:
 *   npx tsx apps/api/src/scripts/cleanupImportedContacts.ts --apply
 *
 * Mesmo caminho de `.env` dos outros scripts desta pasta.
 */
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    const suspects = await prisma.whatsAppContact.findMany({
      where: { source: 'IMPORT' },
      select: { id: true, tenantId: true, phoneE164: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (suspects.length === 0) {
      console.log('Nenhum contato com origem "Planilha" encontrado — nada a limpar.');
      return;
    }

    console.log(`Encontrados ${suspects.length} contato(s) com origem "Planilha":`);
    for (const contact of suspects) {
      console.log(
        `  - ${contact.phoneE164} (${contact.name ?? 'sem nome'}, tenant ${contact.tenantId}, importado em ${contact.createdAt.toISOString()})`,
      );
    }

    if (!apply) {
      console.log('\nMODO SIMULAÇÃO — nada foi apagado.');
      console.log('Para apagar de verdade, rode de novo com --apply no final do comando.');
      return;
    }

    const deleted = await prisma.whatsAppContact.deleteMany({ where: { source: 'IMPORT' } });
    console.log(
      `\n${deleted.count} contato(s) apagado(s). Conversas ligadas a eles continuam existindo (só perderam o vínculo com o Contato).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao limpar contatos importados:', error);
  process.exit(1);
});
