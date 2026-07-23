import { PrismaClient } from '@prisma/client';

import { Cipher } from '../domain/Cipher';
import { CredentialsStore } from '../domain/CredentialsStore';

/**
 * Implementação de `CredentialsStore` sobre o model `TenantCredential`
 * (`prisma/schema.prisma`). Composição com `Cipher`: todo valor é
 * criptografado antes de ir para o banco e decriptografado ao sair — quem
 * consome o port `CredentialsStore` nunca lida com texto cifrado.
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada em
 * PROJECT_STATUS.md §9.3 para o restante do schema desta Milestone): este
 * arquivo referencia `prisma.tenantCredential`, propriedade do Prisma Client
 * GERADO a partir do schema — só existe de fato depois de `npx prisma
 * generate`, o que não foi possível executar neste sandbox (ambiente sem
 * acesso a shell). O nome do finder composto (`tenantId_namespace_key`)
 * segue estritamente a convenção do Prisma para `@@unique([tenantId,
 * namespace, key])`, mas deve ser conferido com `tsc`/`prisma generate` no
 * ambiente real antes do primeiro uso.
 */
export class PrismaCredentialsStore implements CredentialsStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: Cipher,
  ) {}

  async get(tenantId: string, namespace: string, key: string): Promise<string | null> {
    const row = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_namespace_key: { tenantId, namespace, key } },
    });

    if (!row) {
      return null;
    }

    return this.cipher.decrypt(tenantId, row.value);
  }

  async getAll(tenantId: string, namespace: string): Promise<Record<string, string>> {
    const rows = await this.prisma.tenantCredential.findMany({
      where: { tenantId, namespace },
    });

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = this.cipher.decrypt(tenantId, row.value);
    }
    return result;
  }

  async set(tenantId: string, namespace: string, key: string, value: string): Promise<void> {
    const encryptedValue = this.cipher.encrypt(tenantId, value);

    await this.prisma.tenantCredential.upsert({
      where: { tenantId_namespace_key: { tenantId, namespace, key } },
      create: { tenantId, namespace, key, value: encryptedValue },
      update: { value: encryptedValue },
    });
  }

  async remove(tenantId: string, namespace: string, key: string): Promise<void> {
    // `deleteMany` (não `delete`) deliberadamente: `remove()` deve ser
    // idempotente — chamar para uma chave que já não existe não deve
    // lançar (o `delete` do Prisma lançaria P2025 nesse caso).
    await this.prisma.tenantCredential.deleteMany({
      where: { tenantId, namespace, key },
    });
  }

  async clear(tenantId: string, namespace: string): Promise<void> {
    await this.prisma.tenantCredential.deleteMany({
      where: { tenantId, namespace },
    });
  }
}
