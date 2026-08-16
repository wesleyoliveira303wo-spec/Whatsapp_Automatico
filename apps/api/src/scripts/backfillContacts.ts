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
 * IDEMPOTENTE E AUTO-CORRETIVO: conversas já vinculadas são ignoradas, o
 * contato é criado via `findOrCreateByPhone` (apoiado na chave única do
 * banco), e a data de criação é reconciliada a cada execução (ver abaixo).
 * Rodar duas vezes não duplica nada.
 *
 * DATA DE CRIAÇÃO (correção de 2026-08-15): a primeira versão deste script
 * deixava o banco gravar `now()` — resultado: os 38 contatos do histórico
 * ficaram todos com a MESMA data e hora (o instante em que o script rodou),
 * visivelmente inútil na tela de Contatos. O correto é a data da PRIMEIRA
 * conversa daquela pessoa: é quando ela de fato entrou na base. O script
 * agora informa essa data na criação E corrige contatos já existentes cuja
 * data seja posterior à primeira conversa deles — então basta reexecutar
 * para reparar uma base afetada pela versão anterior.
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
    select: {
      id: true,
      tenantId: true,
      sessionName: true,
      contactJid: true,
      createdAt: true,
    },
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
      // A pessoa entrou na base quando a conversa dela começou — não agora.
      // As conversas vêm ordenadas por `createdAt` asc, então a PRIMEIRA que
      // alcança um dado telefone é a mais antiga dele.
      createdAt: conversation.createdAt,
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

  // Reconciliação da data de criação — repara bases afetadas pela primeira
  // versão deste script (ver docstring). Roda SEMPRE, inclusive quando não há
  // nenhuma conversa nova para vincular, porque o dano a reparar está nos
  // contatos JÁ criados. Só ANTECIPA a data (nunca atrasa): um contato cuja
  // data já é a mais antiga não é tocado.
  const desatualizados = await prisma.$queryRaw<Array<{ id: string; primeira: Date }>>`
    SELECT ct.id, MIN(cv.created_at) AS primeira
    FROM whatsapp_contacts ct
    JOIN whatsapp_conversations cv ON cv.contact_id = ct.id
    GROUP BY ct.id, ct.created_at
    HAVING MIN(cv.created_at) < ct.created_at
  `;

  if (desatualizados.length > 0) {
    console.log('');
    console.log(
      `${desatualizados.length} contato(s) com data de criação posterior à primeira conversa.` +
        (apply ? ' Corrigindo...' : ' (seriam corrigidos com --apply)'),
    );
    if (apply) {
      for (const linha of desatualizados) {
        await prisma.whatsAppContact.update({
          where: { id: linha.id },
          data: { createdAt: linha.primeira },
        });
      }
      console.log(`Datas corrigidas: ${desatualizados.length}`);
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
