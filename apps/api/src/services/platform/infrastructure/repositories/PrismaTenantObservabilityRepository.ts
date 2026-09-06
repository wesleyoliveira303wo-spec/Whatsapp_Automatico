import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';
import { TenantOverview } from '../../domain/entities/TenantOverview';
import {
  TenantCampaignCounts,
  TenantDetail,
  TenantSessionEvent,
  TenantSessionSummary,
} from '../../domain/entities/TenantDetail';
import {
  ObservabilityRange,
  TenantObservabilityRepository,
} from '../../domain/repositories/TenantObservabilityRepository';
import { PlatformTotals } from '../../domain/entities/PlatformTotals';

const PLAN_TO_DOMAIN: Record<string, TenantPlan> = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
};

const SESSION_STATUS_TO_DOMAIN: Record<string, TenantSessionSummary['status']> = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
};

/** Teto de eventos de sessão no detalhe — histórico de quedas sem paginação (§6.2). */
const RECENT_SESSION_EVENTS_LIMIT = 30;

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  createdAt: Date;
}
interface SessionAggRow {
  tenantId: string;
  sessionCount: number;
  connectedCount: number;
}
interface CountByTenantRow {
  tenantId: string;
  count: number;
}
interface LastActivityRow {
  tenantId: string;
  lastActivityAt: Date | null;
}
interface MessageAggRow {
  tenantId: string;
  inbound: number;
  outbound: number;
}
interface AiAggRow {
  tenantId: string;
  total: number;
  success: number;
  providerError: number;
  validationRejected: number;
  costUsd: string;
}
interface ConversationAggRow {
  tenantId: string;
  total: number;
  escalated: number;
}
interface AiProfileRow {
  tenantId: string;
  configured: boolean;
}

/**
 * Implementação Prisma da leitura cross-tenant do Centro de Tenants — Fase 2
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §6).
 *
 * ÚNICA camada de `services/platform` que vê SQL, mesmo contrato de
 * `PrismaAnalyticsRepository`: só `$queryRaw` parametrizado (`${}` vira bind
 * param — nunca concatenação), só leitura (nenhuma escrita/cache/rollup),
 * dinheiro como STRING decimal exata (`::text`, D46), contagens como `::int`
 * (evita `BigInt`).
 *
 * `listTenantOverviews` faz **8 consultas agregadas no total** — uma por
 * indicador, cada uma `GROUP BY tenant_id` — e monta o resultado em memória.
 * Nunca uma consulta por tenant (requisito de teste da Fase 2). Todas as
 * consultas de janela filtram pelo MESMO `range`.
 *
 * A leitura NÃO cruza para os repositórios dos outros bounded contexts — lê
 * as tabelas físicas direto, sem importar entidades/ports alheios (mesmo
 * D47 do Analytics). É por isso que este código pode viver aqui sem acoplar
 * `services/platform` a `services/whatsapp`/`ai`/`campaigns`.
 */
export class PrismaTenantObservabilityRepository implements TenantObservabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTenantOverviews(range: ObservabilityRange): Promise<TenantOverview[]> {
    const [tenants, sessions, users, lastActivity, messages, ai, conversations, aiProfiles] =
      await Promise.all([
        this.prisma.$queryRaw<TenantRow[]>(Prisma.sql`
          SELECT "id", "name", "plan"::text AS "plan", "created_at" AS "createdAt"
          FROM "tenants"
        `),
        this.prisma.$queryRaw<SessionAggRow[]>(Prisma.sql`
          SELECT
            "tenant_id" AS "tenantId",
            COUNT(*)::int AS "sessionCount",
            COUNT(*) FILTER (WHERE "status" = 'CONNECTED')::int AS "connectedCount"
          FROM "whatsapp_sessions"
          GROUP BY "tenant_id"
        `),
        this.prisma.$queryRaw<CountByTenantRow[]>(Prisma.sql`
          SELECT "tenant_id" AS "tenantId", COUNT(*)::int AS "count"
          FROM "users"
          GROUP BY "tenant_id"
        `),
        // "Última atividade" = max(last_message_at) de TODA a história (§6.4),
        // não da janela.
        this.prisma.$queryRaw<LastActivityRow[]>(Prisma.sql`
          SELECT "tenant_id" AS "tenantId", MAX("last_message_at") AS "lastActivityAt"
          FROM "whatsapp_conversations"
          GROUP BY "tenant_id"
        `),
        this.prisma.$queryRaw<MessageAggRow[]>(Prisma.sql`
          SELECT
            "tenant_id" AS "tenantId",
            COUNT(*) FILTER (WHERE "direction" = 'INBOUND')::int AS "inbound",
            COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND')::int AS "outbound"
          FROM "whatsapp_messages"
          WHERE "occurred_at" >= ${range.from} AND "occurred_at" <= ${range.to}
          GROUP BY "tenant_id"
        `),
        this.prisma.$queryRaw<AiAggRow[]>(Prisma.sql`
          SELECT
            "tenant_id" AS "tenantId",
            COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "success",
            COUNT(*) FILTER (WHERE "status" = 'PROVIDER_ERROR')::int AS "providerError",
            COUNT(*) FILTER (WHERE "status" = 'VALIDATION_REJECTED')::int AS "validationRejected",
            COALESCE(SUM("cost_usd"), 0)::text AS "costUsd"
          FROM "ai_interactions"
          WHERE "created_at" >= ${range.from} AND "created_at" <= ${range.to}
          GROUP BY "tenant_id"
        `),
        this.prisma.$queryRaw<ConversationAggRow[]>(Prisma.sql`
          SELECT
            "tenant_id" AS "tenantId",
            COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "escalated_at" IS NOT NULL)::int AS "escalated"
          FROM "whatsapp_conversations"
          WHERE "created_at" >= ${range.from} AND "created_at" <= ${range.to}
          GROUP BY "tenant_id"
        `),
        this.prisma.$queryRaw<AiProfileRow[]>(Prisma.sql`
          SELECT
            "tenant_id" AS "tenantId",
            bool_or(length(btrim("content")) > 0) AS "configured"
          FROM "ai_business_profiles"
          GROUP BY "tenant_id"
        `),
      ]);

    const sessionsByTenant = indexBy(sessions, (r) => r.tenantId);
    const usersByTenant = indexBy(users, (r) => r.tenantId);
    const activityByTenant = indexBy(lastActivity, (r) => r.tenantId);
    const messagesByTenant = indexBy(messages, (r) => r.tenantId);
    const aiByTenant = indexBy(ai, (r) => r.tenantId);
    const conversationsByTenant = indexBy(conversations, (r) => r.tenantId);
    const profilesByTenant = indexBy(aiProfiles, (r) => r.tenantId);

    return tenants.map((tenant) => {
      const session = sessionsByTenant.get(tenant.id);
      const message = messagesByTenant.get(tenant.id);
      const aiRow = aiByTenant.get(tenant.id);
      const conversation = conversationsByTenant.get(tenant.id);

      return {
        id: tenant.id,
        name: tenant.name,
        plan: PLAN_TO_DOMAIN[tenant.plan] ?? 'free',
        createdAt: tenant.createdAt,
        sessionCount: session?.sessionCount ?? 0,
        connectedSessionCount: session?.connectedCount ?? 0,
        userCount: usersByTenant.get(tenant.id)?.count ?? 0,
        lastActivityAt: activityByTenant.get(tenant.id)?.lastActivityAt ?? null,
        messages30d: {
          inbound: message?.inbound ?? 0,
          outbound: message?.outbound ?? 0,
        },
        ai30d: {
          total: aiRow?.total ?? 0,
          success: aiRow?.success ?? 0,
          providerError: aiRow?.providerError ?? 0,
          validationRejected: aiRow?.validationRejected ?? 0,
          costUsd: aiRow?.costUsd ?? '0',
        },
        conversations30d: {
          total: conversation?.total ?? 0,
          escalated: conversation?.escalated ?? 0,
        },
        aiProfileConfigured: profilesByTenant.get(tenant.id)?.configured ?? false,
      };
    });
  }

  async getTenantDetail(
    tenantId: string,
    range: ObservabilityRange,
  ): Promise<TenantDetail | null> {
    const overviews = await this.listTenantOverviews(range);
    const overview = overviews.find((o) => o.id === tenantId);
    if (!overview) return null;

    const [sessionRows, campaignRows, contactRows, eventRows, profileRows] = await Promise.all([
      this.prisma.$queryRaw<
        { sessionName: string; status: string; phoneNumber: string | null; lastSeen: Date | null }[]
      >(Prisma.sql`
        SELECT
          s."session_name" AS "sessionName",
          s."status"::text AS "status",
          s."phone_number" AS "phoneNumber",
          s."last_seen" AS "lastSeen"
        FROM "whatsapp_sessions" AS s
        WHERE s."tenant_id" = ${tenantId}
        ORDER BY s."session_name" ASC
      `),
      this.prisma.$queryRaw<
        { total: number; running: number; paused: number; pausedByBreaker: number }[]
      >(Prisma.sql`
        SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE "status" = 'RUNNING')::int AS "running",
          COUNT(*) FILTER (WHERE "status" = 'PAUSED')::int AS "paused",
          COUNT(*) FILTER (WHERE "status" = 'PAUSED' AND "paused_reason" IS NOT NULL)::int
            AS "pausedByBreaker"
        FROM "campaigns"
        WHERE "tenant_id" = ${tenantId}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM "whatsapp_contacts"
        WHERE "tenant_id" = ${tenantId}
      `),
      this.prisma.$queryRaw<
        {
          sessionName: string;
          status: string;
          disconnectReason: string | null;
          occurredAt: Date;
        }[]
      >(Prisma.sql`
        SELECT
          "session_name" AS "sessionName",
          "status"::text AS "status",
          "disconnect_reason"::text AS "disconnectReason",
          "occurred_at" AS "occurredAt"
        FROM "whatsapp_session_events"
        WHERE "tenant_id" = ${tenantId}
        ORDER BY "occurred_at" DESC
        LIMIT ${RECENT_SESSION_EVENTS_LIMIT}
      `),
      this.prisma.$queryRaw<{ sessionName: string; configured: boolean }[]>(Prisma.sql`
        SELECT "session_name" AS "sessionName", length(btrim("content")) > 0 AS "configured"
        FROM "ai_business_profiles"
        WHERE "tenant_id" = ${tenantId}
      `),
    ]);

    const profileBySession = indexBy(profileRows, (r) => r.sessionName);

    const sessions: TenantSessionSummary[] = sessionRows.map((row) => ({
      sessionName: row.sessionName,
      status: SESSION_STATUS_TO_DOMAIN[row.status] ?? 'disconnected',
      phoneNumber: row.phoneNumber,
      lastSeen: row.lastSeen,
      aiProfileConfigured: profileBySession.get(row.sessionName)?.configured ?? false,
    }));

    const campaigns: TenantCampaignCounts = campaignRows[0] ?? {
      total: 0,
      running: 0,
      paused: 0,
      pausedByBreaker: 0,
    };

    const recentSessionEvents: TenantSessionEvent[] = eventRows.map((row) => ({
      sessionName: row.sessionName,
      status: SESSION_STATUS_TO_DOMAIN[row.status] ?? 'disconnected',
      disconnectReason: row.disconnectReason,
      occurredAt: row.occurredAt,
    }));

    return {
      ...overview,
      sessions,
      campaigns,
      contactCount: contactRows[0]?.count ?? 0,
      recentSessionEvents,
    };
  }

  async listAllSessions(): Promise<
    Array<{ tenantId: string; sessionName: string; status: string }>
  > {
    return this.prisma.$queryRaw<
      Array<{ tenantId: string; sessionName: string; status: string }>
    >(Prisma.sql`
      SELECT "tenant_id" AS "tenantId", "session_name" AS "sessionName", "status"::text AS "status"
      FROM "whatsapp_sessions"
    `);
  }

  async platformTotals(range: ObservabilityRange): Promise<PlatformTotals> {
    const [plans, users, sessions, messages, ai, campaigns] = await Promise.all([
      this.prisma.$queryRaw<{ plan: string; count: number }[]>(Prisma.sql`
        SELECT "plan"::text AS "plan", COUNT(*)::int AS "count" FROM "tenants" GROUP BY "plan"
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "count" FROM "users"
      `),
      this.prisma.$queryRaw<{ total: number; connected: number }[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE "status" = 'CONNECTED')::int AS "connected"
        FROM "whatsapp_sessions"
      `),
      this.prisma.$queryRaw<{ inbound: number; outbound: number }[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "direction" = 'INBOUND')::int AS "inbound",
          COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND')::int AS "outbound"
        FROM "whatsapp_messages"
        WHERE "occurred_at" >= ${range.from} AND "occurred_at" <= ${range.to}
      `),
      this.prisma.$queryRaw<
        { total: number; success: number; providerError: number; validationRejected: number; costUsd: string }[]
      >(Prisma.sql`
        SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "success",
          COUNT(*) FILTER (WHERE "status" = 'PROVIDER_ERROR')::int AS "providerError",
          COUNT(*) FILTER (WHERE "status" = 'VALIDATION_REJECTED')::int AS "validationRejected",
          COALESCE(SUM("cost_usd"), 0)::text AS "costUsd"
        FROM "ai_interactions"
        WHERE "created_at" >= ${range.from} AND "created_at" <= ${range.to}
      `),
      this.prisma.$queryRaw<{ running: number; pausedByBreaker: number }[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "status" = 'RUNNING')::int AS "running",
          COUNT(*) FILTER (WHERE "status" = 'PAUSED' AND "paused_reason" IS NOT NULL)::int
            AS "pausedByBreaker"
        FROM "campaigns"
      `),
    ]);

    const byPlan: Record<TenantPlan, number> = { free: 0, pro: 0, enterprise: 0 };
    let tenantTotal = 0;
    for (const row of plans) {
      const plan = PLAN_TO_DOMAIN[row.plan] ?? 'free';
      byPlan[plan] += row.count;
      tenantTotal += row.count;
    }

    const aiRow = ai[0] ?? {
      total: 0,
      success: 0,
      providerError: 0,
      validationRejected: 0,
      costUsd: '0',
    };

    return {
      tenants: { total: tenantTotal, byPlan },
      users: users[0]?.count ?? 0,
      sessions: { total: sessions[0]?.total ?? 0, connected: sessions[0]?.connected ?? 0 },
      messages30d: {
        inbound: messages[0]?.inbound ?? 0,
        outbound: messages[0]?.outbound ?? 0,
      },
      ai30d: {
        total: aiRow.total,
        success: aiRow.success,
        providerError: aiRow.providerError,
        validationRejected: aiRow.validationRejected,
        costUsd: aiRow.costUsd,
      },
      campaigns: {
        running: campaigns[0]?.running ?? 0,
        pausedByBreaker: campaigns[0]?.pausedByBreaker ?? 0,
      },
    };
  }
}

function indexBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(keyFn(row), row);
  return map;
}
