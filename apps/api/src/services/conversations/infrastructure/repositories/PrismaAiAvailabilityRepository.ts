import type { PrismaClient } from '@prisma/client';

import { AiAvailabilityRepository } from '../../domain/repositories/AiAvailabilityRepository';

/**
 * Implementação real de `AiAvailabilityRepository` (Fase 1, Botão POWER,
 * 2026-08-07) — lê SÓ a coluna `ai_enabled` da tabela `ai_business_profiles`
 * (mesma tabela do Cérebro da IA, `services/ai`), via `findUnique` com
 * `select` (nunca carrega `content`/campos de horário, que não interessam
 * aqui). Sessão sem nenhuma linha ainda (Cérebro da IA nunca configurado, ou
 * Botão POWER nunca usado) devolve `true` — default sempre "ligado", nunca
 * "desligado por ausência de dado".
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de todo repositório
 * Prisma deste projeto) — nenhum valor do Prisma é importado.
 */
export class PrismaAiAvailabilityRepository implements AiAvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isEnabled(tenantId: string, sessionName: string): Promise<boolean> {
    const row = await this.prisma.aiBusinessProfile.findUnique({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      select: { aiEnabled: true },
    });
    return row?.aiEnabled ?? true;
  }
}
