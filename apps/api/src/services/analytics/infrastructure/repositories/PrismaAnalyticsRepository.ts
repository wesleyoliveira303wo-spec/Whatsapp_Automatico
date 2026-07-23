import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { AnalyticsRepository } from '../../domain/repositories/AnalyticsRepository';
import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
} from '../../domain/AnalyticsMetrics';

/**
 * Implementacao Prisma do `AnalyticsRepository` (Milestone 4, Bloco M4C —
 * ADR #59). UNICA camada do projeto autorizada a executar SQL (restricao do
 * M4C): `AnalyticsService`/router/composition root nunca veem SQL nem Prisma.
 *
 * Todas as consultas sao read-only (D51): apenas agregacao (`COUNT`/`SUM`/
 * `AVG`/`FILTER`/`GROUP BY`/`date_trunc`). PROIBIDO por D51: qualquer escrita,
 * cache, rollup, tabela agregada, materialized view, job, scheduler.
 *
 * Toda consulta usa exclusivamente `Prisma.sql` + `prisma.$queryRaw`
 * (parametrizado — `tenant_id` e as datas viajam como bind params via `${}`,
 * NUNCA concatenacao manual de string): fecha injection por construcao. Nomes
 * de tabela/coluna sao texto literal (nao input do usuario).
 *
 * Bucketizacao temporal em UTC (D45): `created_at`/`occurred_at` sao
 * `timestamp` armazenados em UTC pelo Prisma, entao `date_trunc('day', col)`
 * ja produz o dia em UTC sem precisar de `AT TIME ZONE`.
 *
 * Precisao monetaria (D46): `SUM(cost_usd)::text` — a soma volta como STRING
 * decimal exata, nunca `number` (arredondamento de float e inaceitavel para
 * dinheiro; restricao herdada do Bloco 3b). Contagens usam `::int` (evita que
 * o `bigint` do `COUNT`/`SUM` chegue como `BigInt` do JS, que quebraria o DTO
 * e a serializacao JSON); medias usam `::float8`.
 *
 * Nao depende de, nem altera, os repositorios dos outros bounded contexts
 * (D47): le as tabelas fisicas (`ai_interactions`, `whatsapp_messages`,
 * `whatsapp_conversations`, `whatsapp_session_events`) por SQL de leitura,
 * sem importar suas entidades/ports. A transformacao SQL -> DTO acontece
 * inteiramente aqui.
 */
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async aiUsageByPeriod(tenantId: string, range: DateRange): Promise<AiUsagePoint[]> {
    // Indice usado: ai_interactions(tenant_id, created_at) (M4A/D43).
    const rows = await this.prisma.$queryRaw<AiUsageRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "interactions",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "successCount",
        COUNT(*) FILTER (WHERE "status" = 'VALIDATION_REJECTED')::int AS "validationRejectedCount",
        COUNT(*) FILTER (WHERE "status" = 'PROVIDER_ERROR')::int AS "providerErrorCount",
        COALESCE(SUM("tokens_input"), 0)::int AS "tokensInput",
        COALESCE(SUM("tokens_output"), 0)::int AS "tokensOutput",
        COALESCE(SUM("cost_usd"), 0)::text AS "costUsd",
        COALESCE(AVG("latency_ms"), 0)::float8 AS "avgLatencyMs"
      FROM "ai_interactions"
      WHERE "tenant_id" = ${tenantId}
        AND "created_at" >= ${range.from}
        AND "created_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({
      date: row.date,
      interactions: row.interactions,
      successCount: row.successCount,
      validationRejectedCount: row.validationRejectedCount,
      providerErrorCount: row.providerErrorCount,
      tokensInput: row.tokensInput,
      tokensOutput: row.tokensOutput,
      costUsd: row.costUsd,
      avgLatencyMs: row.avgLatencyMs,
    }));
  }

  async messageFlowByPeriod(tenantId: string, range: DateRange): Promise<MessageFlowPoint[]> {
    // Indice usado: whatsapp_messages(tenant_id, occurred_at) (M4A/D43).
    const rows = await this.prisma.$queryRaw<MessageFlowRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "occurred_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*) FILTER (WHERE "direction" = 'INBOUND')::int AS "inbound",
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND')::int AS "outbound"
      FROM "whatsapp_messages"
      WHERE "tenant_id" = ${tenantId}
        AND "occurred_at" >= ${range.from}
        AND "occurred_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({ date: row.date, inbound: row.inbound, outbound: row.outbound }));
  }

  async newConversationsByPeriod(tenantId: string, range: DateRange): Promise<NewConversationsPoint[]> {
    // Indice usado: whatsapp_conversations(tenant_id) (existente) + filtro por created_at.
    const rows = await this.prisma.$queryRaw<NewConversationsRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "count"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
        AND "created_at" >= ${range.from}
        AND "created_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({ date: row.date, count: row.count }));
  }

  async conversationStatusCounts(tenantId: string): Promise<ConversationStatusCounts> {
    // Retrato atual (sem faixa de tempo, D42). Indice: whatsapp_conversations(tenant_id).
    const rows = await this.prisma.$queryRaw<ConversationStatusCountsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'BOT')::int AS "bot",
        COUNT(*) FILTER (WHERE "status" = 'HUMAN')::int AS "human"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
    `);

    const row = rows[0];
    return { bot: row?.bot ?? 0, human: row?.human ?? 0 };
  }

  async sessionStabilityByPeriod(tenantId: string, range: DateRange): Promise<SessionStabilityPoint[]> {
    // Indice usado: whatsapp_session_events(tenant_id, session_name, occurred_at) — prefixo tenant_id (existente).
    const rows = await this.prisma.$queryRaw<SessionStabilityRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "occurred_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*) FILTER (WHERE "status" = 'CONNECTED')::int AS "connected",
        COUNT(*) FILTER (WHERE "status" = 'DISCONNECTED')::int AS "disconnected",
        COUNT(*) FILTER (WHERE "status" = 'CONNECTING')::int AS "connecting"
      FROM "whatsapp_session_events"
      WHERE "tenant_id" = ${tenantId}
        AND "occurred_at" >= ${range.from}
        AND "occurred_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({
      date: row.date,
      connected: row.connected,
      disconnected: row.disconnected,
      connecting: row.connecting,
    }));
  }
}

/**
 * Shapes lidos do banco (apos os casts em SQL): so os campos que este
 * repositorio de fato le, mesmo racional dos demais `Prisma*Repository`.
 * `costUsd` como `string` (veio de `::text`), contagens como `number` (::int),
 * medias como `number` (::float8).
 */
interface AiUsageRow {
  date: string;
  interactions: number;
  successCount: number;
  validationRejectedCount: number;
  providerErrorCount: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  avgLatencyMs: number;
}

interface MessageFlowRow {
  date: string;
  inbound: number;
  outbound: number;
}

interface NewConversationsRow {
  date: string;
  count: number;
}

interface ConversationStatusCountsRow {
  bot: number;
  human: number;
}

interface SessionStabilityRow {
  date: string;
  connected: number;
  disconnected: number;
  connecting: number;
}
