/**
 * Ativa/troca o Plano de um tenant — Trava de plano do Lançamento suave
 * (2026-08-31, ver `CONTEXT.md` e `docs/specs/2026-08-31-lancamento-suave.md`).
 *
 * Enquanto não há billing automático, é assim que o fundador ativa um
 * cliente que pagou (por Pix): `pro` ou `enterprise`. Também serve para
 * rebaixar de volta para `free` quem parou de pagar — o tenant volta ao
 * modo só-visualização sem perder nenhum dado.
 *
 * MODO SIMULAÇÃO POR PADRÃO (mesmo contrato de `backfillContacts` e dos
 * demais scripts deste diretório): sem `--apply`, apenas mostra o que faria.
 *
 *   # listar todos os tenants (id, nome, plano atual)
 *   node apps/api/dist/scripts/setTenantPlan.js
 *
 *   # simular a troca (identifica o tenant por id OU por nome exato)
 *   node apps/api/dist/scripts/setTenantPlan.js "Padaria do João" pro
 *   node apps/api/dist/scripts/setTenantPlan.js 3f2a...-uuid pro
 *
 *   # aplicar de verdade
 *   node apps/api/dist/scripts/setTenantPlan.js "Padaria do João" pro --apply
 *
 * No Docker de produção:
 *   docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/scripts/setTenantPlan.js <tenant> <plano> --apply
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient, TenantPlan } from '@prisma/client';

// Mesmo padrão dos demais scripts: fora do container, a `DATABASE_URL` vem do
// `.env` da raiz; dentro do container ela já está no ambiente e o `dotenv`
// não sobrescreve.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const PLAN_BY_ARG: Record<string, TenantPlan> = {
  free: 'FREE',
  pro: 'PRO',
  enterprise: 'ENTERPRISE',
};

async function listTenants(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, plan: true },
    orderBy: { createdAt: 'asc' },
  });
  if (tenants.length === 0) {
    console.log('Nenhum tenant cadastrado.');
    return;
  }
  console.log(`${tenants.length} tenant(s):`);
  console.log('');
  for (const t of tenants) {
    console.log(`  ${t.plan.padEnd(11)} ${t.id}  ${t.name}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--apply');
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  if (args.length === 0) {
    await listTenants(prisma);
    await prisma.$disconnect();
    return;
  }

  if (args.length !== 2) {
    console.error('Uso: setTenantPlan <tenant-id-ou-nome> <free|pro|enterprise> [--apply]');
    console.error('Sem argumentos: lista todos os tenants.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const [tenantArg, planArg] = args;
  const targetPlan = PLAN_BY_ARG[planArg.toLowerCase()];
  if (!targetPlan) {
    console.error(`Plano inválido: "${planArg}". Use free, pro ou enterprise.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  // Identifica por id (match exato) ou, se não achar, por nome exato.
  let tenant = await prisma.tenant.findUnique({
    where: { id: tenantArg },
    select: { id: true, name: true, plan: true },
  });
  if (!tenant) {
    const byName = await prisma.tenant.findMany({
      where: { name: tenantArg },
      select: { id: true, name: true, plan: true },
    });
    if (byName.length === 0) {
      console.error(`Nenhum tenant com id ou nome "${tenantArg}". Rode sem argumentos para listar.`);
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    if (byName.length > 1) {
      console.error(
        `Mais de um tenant com o nome "${tenantArg}" — desambigue pelo id:\n` +
          byName.map((t) => `  ${t.id}`).join('\n'),
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    tenant = byName[0];
  }

  if (tenant.plan === targetPlan) {
    console.log(`"${tenant.name}" (${tenant.id}) já está no plano ${targetPlan}. Nada a fazer.`);
    await prisma.$disconnect();
    return;
  }

  console.log(
    `"${tenant.name}" (${tenant.id}): ${tenant.plan} -> ${targetPlan}` +
      (apply ? '' : '  (seria alterado com --apply)'),
  );

  if (apply) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: targetPlan } });
    console.log('Plano atualizado.');
  } else {
    console.log('');
    console.log('Nada foi gravado. Rode de novo com --apply para aplicar.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Falha ao alterar o plano do tenant:', error);
  process.exitCode = 1;
});
