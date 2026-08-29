import type { PrismaClient } from '@prisma/client';

import { AiBusinessProfile } from '../../domain/entities/AiBusinessProfile';
import {
  AiBusinessProfileRepository,
  AiProfileSaveData,
} from '../../domain/repositories/AiBusinessProfileRepository';

/**
 * Shape mínimo lido do banco — mesmo racional dos demais repositórios Prisma
 * deste projeto: só os campos que este repositório de fato mapeia de volta ao
 * Domain, não o tipo completo gerado pelo Prisma.
 *
 * F1.8 (2026-08-01): inclui os 6 campos de horário de atendimento.
 */
interface AiBusinessProfileRow {
  tenantId: string;
  sessionName: string;
  content: string;
  updatedAt: Date;
  offHoursEnabled: boolean;
  offHoursMessage: string | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  workingDays: number;
  timezone: string;
  aiEnabled: boolean;
  summary: string | null;
  summaryGeneratedAt: Date | null;
}

function toDomain(row: AiBusinessProfileRow): AiBusinessProfile {
  return {
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    content: row.content,
    updatedAt: row.updatedAt,
    offHoursEnabled: row.offHoursEnabled,
    offHoursMessage: row.offHoursMessage,
    workingHoursStart: row.workingHoursStart,
    workingHoursEnd: row.workingHoursEnd,
    workingDays: row.workingDays,
    timezone: row.timezone,
    aiEnabled: row.aiEnabled,
    summary: row.summary,
    summaryGeneratedAt: row.summaryGeneratedAt,
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
 * `upsert` por `(tenantId, sessionName)` (chave composta `@@unique` no
 * schema desde a Milestone 6, Bloco M6H-3): a primeira gravação para aquela
 * sessão cria a linha, as seguintes atualizam todos os campos informados —
 * nunca há mais de uma linha por `(tenant, sessão)`. O `updatedAt` é
 * gerenciado pelo Prisma (`@updatedAt`).
 *
 * F1.8 (2026-08-01): `upsert` agora recebe `AiProfileSaveData` (inclui
 * campos de horário de atendimento) em vez de `content` isolado. Campos
 * opcionais de `AiProfileSaveData` não passados usam os valores já
 * persistidos no `update` (Prisma só atualiza os campos explicitamente
 * informados); no `create`, os valores do schema entram como defaults.
 *
 * NOTA DE VERIFICAÇÃO: depende de `npx prisma generate` + `npx prisma
 * migrate dev` após a migration
 * `20260801150000_add_off_hours_to_ai_business_profile` ser aplicada.
 */
export class PrismaAiBusinessProfileRepository implements AiBusinessProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenantAndSession(
    tenantId: string,
    sessionName: string,
  ): Promise<AiBusinessProfile | null> {
    const row = await this.prisma.aiBusinessProfile.findUnique({
      where: { tenantId_sessionName: { tenantId, sessionName } },
    });
    return row ? toDomain(row) : null;
  }

  async upsert(
    tenantId: string,
    sessionName: string,
    data: AiProfileSaveData,
  ): Promise<AiBusinessProfile> {
    const row = await this.prisma.aiBusinessProfile.upsert({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      create: {
        tenantId,
        sessionName,
        content: data.content,
        ...(data.offHoursEnabled !== undefined && { offHoursEnabled: data.offHoursEnabled }),
        ...(data.offHoursMessage !== undefined && { offHoursMessage: data.offHoursMessage }),
        ...(data.workingHoursStart !== undefined && { workingHoursStart: data.workingHoursStart }),
        ...(data.workingHoursEnd !== undefined && { workingHoursEnd: data.workingHoursEnd }),
        ...(data.workingDays !== undefined && { workingDays: data.workingDays }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
      },
      update: {
        content: data.content,
        ...(data.offHoursEnabled !== undefined && { offHoursEnabled: data.offHoursEnabled }),
        ...(data.offHoursMessage !== undefined && { offHoursMessage: data.offHoursMessage }),
        ...(data.workingHoursStart !== undefined && { workingHoursStart: data.workingHoursStart }),
        ...(data.workingHoursEnd !== undefined && { workingHoursEnd: data.workingHoursEnd }),
        ...(data.workingDays !== undefined && { workingDays: data.workingDays }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
      },
    });
    return toDomain(row);
  }

  async setAiEnabled(
    tenantId: string,
    sessionName: string,
    aiEnabled: boolean,
  ): Promise<AiBusinessProfile> {
    const row = await this.prisma.aiBusinessProfile.upsert({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      create: { tenantId, sessionName, content: '', aiEnabled },
      update: { aiEnabled },
    });
    return toDomain(row);
  }

  /**
   * `update` (não `upsert`) de propósito: só é chamado depois de um `upsert`
   * bem-sucedido no mesmo fluxo (`saveProfile` → `BusinessSummaryService`),
   * então a linha sempre já existe — ver docstring do método na porta.
   */
  async updateSummary(
    tenantId: string,
    sessionName: string,
    summary: string | null,
    summaryGeneratedAt: Date,
  ): Promise<AiBusinessProfile> {
    const row = await this.prisma.aiBusinessProfile.update({
      where: { tenantId_sessionName: { tenantId, sessionName } },
      data: { summary, summaryGeneratedAt },
    });
    return toDomain(row);
  }
}
