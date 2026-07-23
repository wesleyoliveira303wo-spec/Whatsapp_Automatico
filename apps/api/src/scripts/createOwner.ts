import path from 'path';

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { ScryptPasswordHasher } from '../services/auth/infrastructure/ScryptPasswordHasher';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Script LOCAL de criacao do PRIMEIRO usuario (dono/Owner) de um tenant —
 * Milestone 5, Bloco M5C (D62/bootstrap). Mesmo padrao/decisao de
 * `issueApiKey.ts`: sem endpoint HTTP, provisionamento manual. Reaproveita
 * `ScryptPasswordHasher` (PROIBIDO reimplementar hash aqui) e escreve direto
 * via `PrismaClient` (o `UserRepository` de producao nao expoe escrita
 * administrativa pontual como esta).
 *
 * Uso: npx tsx src/scripts/createOwner.ts <tenantId> <email> <senha>
 *
 * A senha e recebida como argumento so por simplicidade de bootstrap local; o
 * hash e o unico valor persistido (a senha crua nunca e guardada).
 */
async function main(): Promise<void> {
  const tenantId = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];

  if (!tenantId || !email || !password) {
    console.error('Uso: npx tsx src/scripts/createOwner.ts <tenantId> <email> <senha>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.error(`Tenant nao encontrado: ${tenantId}`);
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
    if (existing) {
      console.error(`Ja existe um usuario com este e-mail neste tenant: ${email}`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await new ScryptPasswordHasher().hash(password);
    const user = await prisma.user.create({
      data: { tenantId, email, passwordHash, role: 'OWNER', status: 'ACTIVE' },
    });

    console.log('Owner criado com sucesso.');
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`Usuario: ${user.email} (${user.id}) — papel: OWNER`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao criar owner:', error);
  process.exitCode = 1;
});
