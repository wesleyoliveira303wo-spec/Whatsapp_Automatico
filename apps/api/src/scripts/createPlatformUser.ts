import path from 'path';

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { ScryptPasswordHasher } from '../services/auth/infrastructure/ScryptPasswordHasher';
import { PrismaPlatformUserRepository } from '../services/platform/infrastructure/repositories/PrismaPlatformUserRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Cria o admin da PLATAFORMA (o dono do app) — Fase 1 do `/admin`.
 *
 * Sem rota HTTP, de propósito: não existe cadastro do dono da plataforma na
 * internet. Mesmo padrão de `createOwner.ts`/`issueApiKey.ts` — provisionamento
 * manual, hash reaproveitado de `ScryptPasswordHasher` (PROIBIDO reimplementar
 * hash aqui) e nenhuma senha crua persistida.
 *
 * Uso: npx tsx src/scripts/createPlatformUser.ts <email> <nome> <senha>
 */
const MIN_PASSWORD_LENGTH = 12;

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3];
  const password = process.argv[4];

  if (!email || !name || !password) {
    console.error('Uso: npx tsx src/scripts/createPlatformUser.ts <email> <nome> <senha>');
    process.exitCode = 1;
    return;
  }

  // O `/admin` fica publicamente alcançável (risco aceito e registrado em §4
  // do plano mestre); a senha forte é metade da mitigação, então o script
  // recusa uma senha curta em vez de confiar na disciplina de quem digita.
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const repository = new PrismaPlatformUserRepository(prisma);

    const existing = await repository.findByEmail(email);
    if (existing) {
      console.error(`Já existe um admin de plataforma com este e-mail: ${email}`);
      process.exitCode = 1;
      return;
    }

    const user = await repository.create({
      email,
      name,
      passwordHash: await new ScryptPasswordHasher().hash(password),
      status: 'active',
    });

    console.log('Admin da plataforma criado com sucesso.');
    console.log(`${user.name} <${user.email}> (${user.id})`);
    console.log('Acesse /admin/login para entrar.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao criar o admin da plataforma:', error);
  process.exitCode = 1;
});
