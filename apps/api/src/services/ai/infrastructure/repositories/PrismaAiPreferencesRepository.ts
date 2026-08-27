import type { PrismaClient } from '@prisma/client';

import { AiAutonomyLevel, AiPreferences } from '../../domain/entities/AiPreferences';
import {
  AiPreferencesRepository,
  AiPreferencesSaveData,
} from '../../domain/repositories/AiPreferencesRepository';

interface AiPreferencesRow {
  tenantId: string;
  sessionName: string;
  updatedAt: Date;
  autonomyLevel: string;
  maxDiscountPercent: number | null;
  topicsToAvoid: string | null;
  escalateAfterAttempts: number | null;
  customHandoffMessage: string | null;
}

function toDomain(row: AiPreferencesRow): AiPreferences {
  return {
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    updatedAt: row.updatedAt,
    // `autonomyLevel` é `String` no schema (não um enum do Postgres) — a
    // validação de que só os 3 valores reais entram aqui é feita na
    // Presentation (zod), antes de qualquer gravação; uma leitura nunca
    // precisa lançar por um valor fora do enum.
    autonomyLevel: row.autonomyLevel as AiAutonomyLevel,
    maxDiscountPercent: row.maxDiscountPercent,
    topicsToAvoid: row.topicsToAvoid,
    escalateAfterAttempts: row.escalateAfterAttempts,
    customHandoffMessage: row.customHandoffMessage,
  };
}

/**
 * Implementação concreta de `AiPreferencesRepository` sobre o model
 * `AiPreferences` (`prisma/schema.prisma`, Cérebro da IA v3, Fase 3) — mesmo
 * padrão exato de `PrismaAiBusinessProfileRepository` (`upsert` por chave
 * composta `(tenantId, sessionName)`, campos opcionais só entram no `create`/
 * `update` quando informados).
 *
 * NOTA DE VERIFICAÇÃO: depende de `npx prisma migrate deploy` + `npx prisma
 * generate` após a migration `20260826200000_add_ai_preferences`.
 */
export class PrismaAiPreferencesRepository implements AiPreferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenantAndSession(
    tenantId: string,
    sessionName: string,
  ): Promise<AiPreferences | null> {
    const row = await this.prisma.aiPreferences.findUnique({
      where: { tenantId_sessionName: { tenantId, sessionName } },
    });
    return row ? toDomain(row) : null;
  }

  async upsert(
    tenantId: string,
    sessionName: string,
    data: AiPreferencesSaveData,
  ): Promise<AiPreferences> {
    const row = await this.prisma.aiPreferences.upsert({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      create: {
        tenantId,
        sessionName,
        ...(data.autonomyLevel !== undefined && { autonomyLevel: data.autonomyLevel }),
        ...(data.maxDiscountPercent !== undefined && {
          maxDiscountPercent: data.maxDiscountPercent,
        }),
        ...(data.topicsToAvoid !== undefined && { topicsToAvoid: data.topicsToAvoid }),
        ...(data.escalateAfterAttempts !== undefined && {
          escalateAfterAttempts: data.escalateAfterAttempts,
        }),
        ...(data.customHandoffMessage !== undefined && {
          customHandoffMessage: data.customHandoffMessage,
        }),
      },
      update: {
        ...(data.autonomyLevel !== undefined && { autonomyLevel: data.autonomyLevel }),
        ...(data.maxDiscountPercent !== undefined && {
          maxDiscountPercent: data.maxDiscountPercent,
        }),
        ...(data.topicsToAvoid !== undefined && { topicsToAvoid: data.topicsToAvoid }),
        ...(data.escalateAfterAttempts !== undefined && {
          escalateAfterAttempts: data.escalateAfterAttempts,
        }),
        ...(data.customHandoffMessage !== undefined && {
          customHandoffMessage: data.customHandoffMessage,
        }),
      },
    });
    return toDomain(row);
  }
}
