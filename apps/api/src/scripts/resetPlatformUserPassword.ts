import path from 'path';
import readline from 'readline';

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { ScryptPasswordHasher } from '../services/auth/infrastructure/ScryptPasswordHasher';
import {
  MIN_PLATFORM_PASSWORD_LENGTH,
  resetPlatformUserPassword,
} from '../services/platform/application/resetPlatformUserPassword';
import { PrismaPlatformAuditLogRepository } from '../services/platform/infrastructure/repositories/PrismaPlatformAuditLogRepository';
import { PrismaPlatformUserRepository } from '../services/platform/infrastructure/repositories/PrismaPlatformUserRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Troca a senha do admin da plataforma (`/admin`).
 *
 * A senha é pedida no terminal SEM aparecer na tela — nunca como argumento,
 * para não ficar no histórico do shell (foi assim que a senha anterior vazou).
 *
 * Uso (produção, dentro do container):
 *   docker compose -f docker-compose.prod.yml exec api node apps/api/dist/scripts/resetPlatformUserPassword.js <email>
 * Uso (dev):
 *   npx tsx src/scripts/resetPlatformUserPassword.ts <email>
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    // Silencia o eco do que é digitado; a pergunta em si é escrita antes de mutar.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || process.argv.length > 3) {
    console.error('Uso: resetPlatformUserPassword <email>   (a senha é pedida em seguida, sem aparecer na tela)');
    process.exitCode = 1;
    return;
  }

  const password = await askHidden(`Nova senha (mín. ${MIN_PLATFORM_PASSWORD_LENGTH} caracteres): `);
  const confirmation = await askHidden('Repita a nova senha: ');
  if (password !== confirmation) {
    console.error('As senhas não conferem. Nada foi alterado.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const result = await resetPlatformUserPassword(
      {
        users: new PrismaPlatformUserRepository(prisma),
        audit: new PrismaPlatformAuditLogRepository(prisma),
        hasher: new ScryptPasswordHasher(),
      },
      email,
      password,
    );

    if (!result.ok) {
      console.error(
        result.reason === 'too_short'
          ? `A senha precisa ter ao menos ${MIN_PLATFORM_PASSWORD_LENGTH} caracteres. Nada foi alterado.`
          : `Nenhum admin da plataforma com o e-mail ${email}. Nada foi alterado.`,
      );
      process.exitCode = 1;
      return;
    }

    console.log('Senha do /admin trocada. Sessões já abertas continuam válidas até expirar (8h).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao trocar a senha do admin da plataforma:', error);
  process.exitCode = 1;
});
