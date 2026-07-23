import path from 'path';
import { randomBytes } from 'crypto';

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { HmacSha256ApiKeyHasher } from '../shared/security/infrastructure/HmacSha256ApiKeyHasher';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const API_KEY_BYTES = 32; // 256 bits — alta entropia, ver justificativa em ApiKeyHasher.ts

/**
 * Script LOCAL de emissão de API key para um tenant (Production Hardening,
 * Bloco 3) — decisão arquitetural fechada: sem endpoint HTTP, sem
 * Application Service. Provisionamento de tenant e emissão de chave
 * continuam operações manuais desta milestone (ver TenantRepository.ts).
 *
 * Reaproveita `HmacSha256ApiKeyHasher` diretamente — é PROIBIDO reimplementar
 * hashing aqui. Se o algoritmo mudar no futuro, muda em um único lugar
 * (`HmacSha256ApiKeyHasher`), nunca duplicado neste script.
 *
 * Escreve diretamente via `PrismaClient` (não via `TenantRepository`, que é
 * deliberadamente somente leitura) — este é exatamente o tipo de escrita
 * pontual/manual que `TenantRepository` decidiu propositalmente não expor.
 *
 * Uso: npx tsx src/scripts/issueApiKey.ts <tenantId>
 *
 * A chave em texto plano só é exibida UMA VEZ (não é armazenada em lugar
 * nenhum — só o hash é persistido). Se for perdida, é necessário emitir uma
 * nova (sobrescrevendo a anterior, que passa a ser inválida).
 */
async function main(): Promise<void> {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Uso: npx tsx src/scripts/issueApiKey.ts <tenantId>');
    process.exitCode = 1;
    return;
  }

  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper) {
    console.error(
      'API_KEY_PEPPER não configurada. Defina no .env (ver .env.example) — gere com: openssl rand -base64 32',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.error(`Tenant não encontrado: ${tenantId}`);
      process.exitCode = 1;
      return;
    }

    const rawApiKey = randomBytes(API_KEY_BYTES).toString('base64url');
    const hasher = new HmacSha256ApiKeyHasher(pepper);
    const apiKeyHash = hasher.hash(rawApiKey);

    await prisma.tenant.update({ where: { id: tenantId }, data: { apiKeyHash } });

    console.log('API key emitida com sucesso.');
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`API key (copie agora — não será exibida novamente): ${rawApiKey}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao emitir API key:', error);
  process.exitCode = 1;
});
