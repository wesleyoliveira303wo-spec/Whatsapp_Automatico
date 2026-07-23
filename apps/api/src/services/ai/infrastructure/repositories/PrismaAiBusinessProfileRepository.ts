import type { PrismaClient } from '@prisma/client';

import { AiBusinessProfile } from '../../domain/entities/AiBusinessProfile';
import { AiBusinessProfileRepository } from '../../domain/repositories/AiBusinessProfileRepository';

/**
 * Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma
 * deste projeto: só os campos que este repositório de fato mapeia de volta ao
 * Domain, não o tipo completo gerado pelo Prisma.
 */
interface AiBusinessProfileRow {
  tenantId: string;
  content: string;
  updatedAt: Date;
}

function toDomain(row: AiBusinessProfileRow): AiBusinessProfile {
  return {
    tenantId: row.tenantId,
    content: row.content,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementação concreta de `AiBusinessProfileRepository` sobre o model
 * `AiBusinessProfile` (`prisma/schema.prisma`, Base de Conhecimento Nível 1).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto) — nenhum valor do Prisma é importado, então o
 * `ts-jest` erasa o import inteiro em transpilação (`isolatedModules`), sem
 * disparar `require('@prisma/client')` em runtime.
 *
 * `upsert` por `tenantId` (que é `@unique` no schema): a primeira gravação
 * cria a linha, as seguintes atualizam o `content` — a relação é 1:1 com
 * Tenant, então nunca há mais de uma linha por empresa. `create`/`update`
 * carregam o mesmo `content`; o `updatedAt` é gerenciado pelo Prisma
 * (`@updatedAt`).
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais arquivos
 * Prisma): depende de `npx prisma generate` (Client, para o tipo
 * `prisma.aiBusinessProfile` existir) e `npx prisma migrate deploy`/`dev` (a
 * tabela) terem rodado.
 */
export class PrismaAiBusinessProfileRepository implements AiBusinessProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenant(tenantId: string): Promise<AiBusinessProfile | null> {
    const row = await this.prisma.aiBusinessProfile.findUnique({ where: { tenantId } });
    return row ? toDomain(row) : null;
  }

  async upsert(tenantId: string, content: string): Promise<AiBusinessProfile> {
    const row = await this.prisma.aiBusinessProfile.upsert({
      where: { tenantId },
      create: { tenantId, content },
      update: { content },
    });
    return toDomain(row);
  }
}
