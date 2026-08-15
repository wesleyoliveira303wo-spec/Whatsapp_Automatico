/**
 * Cria a identidade de contato para as conversas que já existiam antes da
 * Fase L, Bloco L1 — e liga cada uma à sua pessoa.
 *
 * A partir do L1, `MessageIngestionService` faz isso sozinho a cada mensagem
 * nova; este script existe só para o histórico, que nunca receberá uma
 * mensagem "primeira" de novo.
 *
 * MODO SIMULAÇÃO POR PADRÃO (mesmo contrato de `cleanupStatusBroadcastConversations`
 * e `cleanupLidConversations`): sem argumento, apenas relata o que faria.
 * Grave de verdade só com `--apply`.
 *
 *   docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/backfillContacts.js
 *   docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/backfillContacts.js --apply
 *
 * IDEMPOTENTE: conversas já vinculadas são ignoradas, e o contato é criado via
 * `findOrCreateByPhone` (apoiado na chave única do banco). Rodar duas vezes não
 * duplica nada.
 *
 * Conversas em `@lid` são deliberadamente PULADAS: não há telefone a extrair de
 * um endereço de privacidade. Elas ganham contato naturalmente se a pessoa
 * voltar a escrever de um endereço com número real.
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaContactRepository } from '../services/contacts/infrastructure/repositories/PrismaContactRepository';
import { phoneFromWhatsAppJid } from '../services/contacts/domain/phoneNumber';

// Mesmo padrão dos demais scripts deste diretório: fora do container, a
// `DATABASE_URL` vem do `.env` da raiz. Dentro do container ela já está no
// ambiente (via `env_file`/`environment` do compose) e o `dotenv` não
// sobrescreve o que já existe — o mesmo arquivo serve aos dois casos.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const contactRepository = new PrismaContactRepository(prisma);

  const conversations = await prisma.whatsAppConversation.findMany({
    where: { contactId: null },
    select: { id: true, tenantId: true, sessionName: true, contactJid: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `${conversations.length} conversa(s) sem contato associado.` +
      (apply ? ' Aplicando...' : ' MODO SIMULAÇÃO — nada será gravado (use --apply).'),
  );

  let vinculadas = 0;
  let semTelefone = 0;
  const identidades = new Set<string>();

  for (const conversation of conversations) {
    const phoneE164 = phoneFromWhatsAppJid(conversation.contactJid);

    if (!phoneE164) {
      semTelefone += 1;
      console.log(`  [pulada] ${conversation.contactJid} — sem telefone (LID/grupo/canal)`);
      continue;
    }

    identidades.add(`${conversation.tenantId}:${phoneE164}`);

    if (!apply) {
      console.log(`  [simulado] ${conversation.contactJid} → ${phoneE164}`);
      vinculadas += 1;
      continue;
    }

    const contact = await contactRepository.findOrCreateByPhone({
      tenantId: conversation.tenantId,
      phoneE164,
      source: 'whatsapp',
    });

    // Mesmo critério do repositório real: só preenche quando ainda está vazio.
    const { count } = await prisma.whatsAppConversation.updateMany({
      where: { id: conversation.id, tenantId: conversation.tenantId, contactId: null },
      data: { contactId: contact.id },
    });

    if (count > 0) {
      vinculadas += 1;
      console.log(`  [ok] ${conversation.contactJid} → ${phoneE164}`);
    }
  }

  console.log('');
  console.log(`Conversas vinculadas: ${vinculadas}`);
  console.log(`Conversas puladas (sem telefone): ${semTelefone}`);
  console.log(`Identidades distintas: ${identidades.size}`);
  if (!apply) {
    console.log('');
    console.log('Nada foi gravado. Rode de novo com --apply para aplicar.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Falha no backfill de contatos:', error);
  process.exitCode = 1;
});
