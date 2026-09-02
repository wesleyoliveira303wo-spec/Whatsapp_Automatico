/**
 * Apaga TODOS os dados de um tenant, a pedido (direito de exclusão da LGPD)
 * — Lançamento suave, T7 (ver `CONTEXT.md`).
 *
 * Remove em cascata: conversas, mensagens, sessões e seus eventos, contatos
 * e eventos de consentimento, campanhas e destinatários, perfis de IA,
 * preferências de IA, FAQ, tags (e vínculos conversa-tag), respostas
 * rápidas, interações de IA, usuários, refresh tokens, trilha de auditoria
 * e, por fim, o próprio tenant.
 *
 * MODO SIMULAÇÃO POR PADRÃO (mesmo contrato de `backfillContacts` /
 * `setTenantPlan` / dos demais scripts deste diretório): sem `--apply`,
 * apenas conta e mostra o que seria apagado. Apaga de verdade só com
 * `--apply`.
 *
 *   # listar todos os tenants (id, nome)
 *   node apps/api/dist/scripts/deleteTenant.js
 *
 *   # simular (identifica por id OU por nome exato)
 *   node apps/api/dist/scripts/deleteTenant.js "Padaria do João"
 *   node apps/api/dist/scripts/deleteTenant.js 3f2a...-uuid
 *
 *   # apagar de verdade
 *   node apps/api/dist/scripts/deleteTenant.js "Padaria do João" --apply
 *
 * No Docker de produção:
 *   docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/deleteTenant.js <tenant> --apply
 *
 * IRREVERSÍVEL. Não há lixeira nem backup automático — quem roda com
 * `--apply` deve ter certeza (e, idealmente, um dump do banco antes).
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';

// Mesmo padrão dos demais scripts: fora do container, a `DATABASE_URL` vem do
// `.env` da raiz; dentro do container ela já está no ambiente e o `dotenv`
// não sobrescreve.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Ordem de exclusão: filhos antes dos pais. Quase todas as tabelas têm
 * `ON DELETE CASCADE` a partir de `Tenant` no schema, então apagar o tenant
 * sozinho já limparia tudo — fazemos explícito assim mesmo para (1) contar
 * por tabela, (2) não depender exclusivamente da cascata e (3) o teste de
 * integração poder afirmar "zero linha órfã em cada tabela".
 *
 * Cada item roda um `deleteMany` escopado ao tenant. `WhatsAppConversationTag`
 * e `RefreshToken` não têm `tenantId` próprio — chegam pela relação.
 */
type Deleter = (tx: Prisma.TransactionClient, tenantId: string) => Promise<number>;

const STEPS: ReadonlyArray<{ label: string; count: Deleter; del: Deleter }> = [
  {
    label: 'Vínculos conversa-tag',
    count: (tx, t) => tx.whatsAppConversationTag.count({ where: { conversation: { tenantId: t } } }),
    del: (tx, t) =>
      tx.whatsAppConversationTag
        .deleteMany({ where: { conversation: { tenantId: t } } })
        .then((r) => r.count),
  },
  {
    label: 'Mensagens',
    count: (tx, t) => tx.whatsAppMessage.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.whatsAppMessage.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Interações de IA',
    count: (tx, t) => tx.aiInteraction.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.aiInteraction.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Destinatários de campanha',
    count: (tx, t) => tx.campaignRecipient.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.campaignRecipient.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Campanhas',
    count: (tx, t) => tx.campaign.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.campaign.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Eventos de consentimento',
    count: (tx, t) => tx.contactConsentEvent.count({ where: { tenantId: t } }),
    del: (tx, t) =>
      tx.contactConsentEvent.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Conversas',
    count: (tx, t) => tx.whatsAppConversation.count({ where: { tenantId: t } }),
    del: (tx, t) =>
      tx.whatsAppConversation.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Contatos',
    count: (tx, t) => tx.whatsAppContact.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.whatsAppContact.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Perfis de IA (Cérebro)',
    count: (tx, t) => tx.aiBusinessProfile.count({ where: { tenantId: t } }),
    del: (tx, t) =>
      tx.aiBusinessProfile.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Preferências de IA',
    count: (tx, t) => tx.aiPreferences.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.aiPreferences.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'FAQ da IA',
    count: (tx, t) => tx.aiFaqEntry.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.aiFaqEntry.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Respostas rápidas',
    count: (tx, t) => tx.quickReply.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.quickReply.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Tags',
    count: (tx, t) => tx.whatsAppTag.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.whatsAppTag.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Eventos de sessão',
    count: (tx, t) => tx.whatsAppSessionEvent.count({ where: { tenantId: t } }),
    del: (tx, t) =>
      tx.whatsAppSessionEvent.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Sessões de WhatsApp',
    count: (tx, t) => tx.whatsAppSession.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.whatsAppSession.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Credenciais do tenant',
    count: (tx, t) => tx.tenantCredential.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.tenantCredential.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Refresh tokens',
    count: (tx, t) => tx.refreshToken.count({ where: { user: { tenantId: t } } }),
    del: (tx, t) =>
      tx.refreshToken.deleteMany({ where: { user: { tenantId: t } } }).then((r) => r.count),
  },
  {
    label: 'Usuários',
    count: (tx, t) => tx.user.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.user.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
  {
    label: 'Trilha de auditoria',
    count: (tx, t) => tx.auditLog.count({ where: { tenantId: t } }),
    del: (tx, t) => tx.auditLog.deleteMany({ where: { tenantId: t } }).then((r) => r.count),
  },
];

export interface TenantDeletionReport {
  /** Contagem por rótulo de tabela — o que foi (ou seria) apagado. */
  counts: Record<string, number>;
  total: number;
}

/** Conta, sem apagar nada, tudo que pertence ao tenant. */
export async function countTenantData(
  prisma: PrismaClient,
  tenantId: string,
): Promise<TenantDeletionReport> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const step of STEPS) {
    const n = await step.count(prisma as unknown as Prisma.TransactionClient, tenantId);
    counts[step.label] = n;
    total += n;
  }
  return { counts, total };
}

/**
 * Apaga tudo do tenant (e o próprio tenant) numa transação única — ou tudo,
 * ou nada. Devolve a contagem do que foi de fato removido em cada tabela.
 * Reaproveitável pelo teste de integração.
 */
export async function deleteTenantData(
  prisma: PrismaClient,
  tenantId: string,
): Promise<TenantDeletionReport> {
  return prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const step of STEPS) {
      const n = await step.del(tx, tenantId);
      counts[step.label] = n;
      total += n;
    }
    await tx.tenant.delete({ where: { id: tenantId } });
    return { counts, total };
  });
}

async function listTenants(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (tenants.length === 0) {
    console.log('Nenhum tenant cadastrado.');
    return;
  }
  console.log(`${tenants.length} tenant(s):`);
  console.log('');
  for (const t of tenants) {
    console.log(`  ${t.id}  ${t.name}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--apply');
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    if (args.length === 0) {
      await listTenants(prisma);
      return;
    }
    if (args.length !== 1) {
      console.error('Uso: deleteTenant <tenant-id-ou-nome> [--apply]');
      console.error('Sem argumentos: lista todos os tenants.');
      process.exitCode = 1;
      return;
    }

    const tenantArg = args[0];
    let tenant = await prisma.tenant.findUnique({
      where: { id: tenantArg },
      select: { id: true, name: true },
    });
    if (!tenant) {
      const byName = await prisma.tenant.findMany({
        where: { name: tenantArg },
        select: { id: true, name: true },
      });
      if (byName.length === 0) {
        console.error(
          `Nenhum tenant com id ou nome "${tenantArg}". Rode sem argumentos para listar.`,
        );
        process.exitCode = 1;
        return;
      }
      if (byName.length > 1) {
        console.error(
          `Mais de um tenant com o nome "${tenantArg}" — desambigue pelo id:\n` +
            byName.map((t) => `  ${t.id}`).join('\n'),
        );
        process.exitCode = 1;
        return;
      }
      tenant = byName[0];
    }

    console.log(
      `Tenant "${tenant.name}" (${tenant.id}) — ${apply ? 'APAGANDO' : 'MODO SIMULAÇÃO'}:`,
    );
    console.log('');

    if (apply) {
      const report = await deleteTenantData(prisma, tenant.id);
      for (const [label, n] of Object.entries(report.counts)) {
        console.log(`  ${String(n).padStart(6)}  ${label}`);
      }
      console.log('');
      console.log(`Total de linhas apagadas: ${report.total}`);
      console.log(`Tenant "${tenant.name}" apagado.`);
    } else {
      const report = await countTenantData(prisma, tenant.id);
      for (const [label, n] of Object.entries(report.counts)) {
        console.log(`  ${String(n).padStart(6)}  ${label}`);
      }
      console.log('');
      console.log(`Total de linhas que seriam apagadas: ${report.total} (+ o próprio tenant)`);
      console.log('');
      console.log('Nada foi apagado. Rode de novo com --apply para aplicar. IRREVERSÍVEL.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda o CLI quando executado direto (não quando importado pelo teste).
if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao apagar o tenant:', error);
    process.exitCode = 1;
  });
}
