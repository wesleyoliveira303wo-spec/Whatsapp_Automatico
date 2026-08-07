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
  PipelineFunnelCounts,
  EscalationRatePoint,
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
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26) — toda consulta agora tambem filtra
 * por `sessionName`. `whatsapp_conversations`/`whatsapp_session_events` ja
 * tem a coluna `session_name` INDEXADA (filtro direto, sem JOIN extra).
 * `ai_interactions`/`whatsapp_messages` NAO tem `session_name` proprio — a
 * decisao do fundador foi resolver com `INNER JOIN` em
 * `whatsapp_conversations` (via `conversation_id`) em vez de denormalizar a
 * coluna nessas duas tabelas (evita mais uma migration neste bloco; o custo
 * extra do join e aceitavel no volume atual, mesmo espirito de "indice
 * melhor antes de pre-agregacao" que ja rege este bounded context, D51).
 */
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async aiUsageByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<AiUsagePoint[]> {
    // JOIN com whatsapp_conversations (ai_interactions nao tem session_name
    // proprio) — indice usado do lado de ai_interactions:
    // (tenant_id, created_at) (M4A/D43); do lado da conversa, a FK
    // conversation_id (@id, unica) resolve por index scan direto.
    const rows = await this.prisma.$queryRaw<AiUsageRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "ai"."created_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "interactions",
        COUNT(*) FILTER (WHERE "ai"."status" = 'SUCCESS')::int AS "successCount",
        COUNT(*) FILTER (WHERE "ai"."status" = 'VALIDATION_REJECTED')::int AS "validationRejectedCount",
        COUNT(*) FILTER (WHERE "ai"."status" = 'PROVIDER_ERROR')::int AS "providerErrorCount",
        COALESCE(SUM("ai"."tokens_input"), 0)::int AS "tokensInput",
        COALESCE(SUM("ai"."tokens_output"), 0)::int AS "tokensOutput",
        COALESCE(SUM("ai"."cost_usd"), 0)::text AS "costUsd",
        COALESCE(AVG("ai"."latency_ms"), 0)::float8 AS "avgLatencyMs"
      FROM "ai_interactions" AS "ai"
      INNER JOIN "whatsapp_conversations" AS "conv" ON "conv"."id" = "ai"."conversation_id"
      WHERE "ai"."tenant_id" = ${tenantId}
        AND "conv"."session_name" = ${sessionName}
        AND "ai"."created_at" >= ${range.from}
        AND "ai"."created_at" <= ${range.to}
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

  async messageFlowByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<MessageFlowPoint[]> {
    // JOIN com whatsapp_conversations (whatsapp_messages nao tem session_name
    // proprio) — mesmo racional de aiUsageByPeriod acima.
    const rows = await this.prisma.$queryRaw<MessageFlowRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "msg"."occurred_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*) FILTER (WHERE "msg"."direction" = 'INBOUND')::int AS "inbound",
        COUNT(*) FILTER (WHERE "msg"."direction" = 'OUTBOUND')::int AS "outbound"
      FROM "whatsapp_messages" AS "msg"
      INNER JOIN "whatsapp_conversations" AS "conv" ON "conv"."id" = "msg"."conversation_id"
      WHERE "msg"."tenant_id" = ${tenantId}
        AND "conv"."session_name" = ${sessionName}
        AND "msg"."occurred_at" >= ${range.from}
        AND "msg"."occurred_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({ date: row.date, inbound: row.inbound, outbound: row.outbound }));
  }

  async newConversationsByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<NewConversationsPoint[]> {
    // session_name proprio, ja indexado — filtro direto, sem join.
    const rows = await this.prisma.$queryRaw<NewConversationsRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "count"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
        AND "session_name" = ${sessionName}
        AND "created_at" >= ${range.from}
        AND "created_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({ date: row.date, count: row.count }));
  }

  async conversationStatusCounts(
    tenantId: string,
    sessionName: string,
  ): Promise<ConversationStatusCounts> {
    // Retrato atual (sem faixa de tempo, D42). session_name proprio, ja indexado.
    const rows = await this.prisma.$queryRaw<ConversationStatusCountsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'BOT')::int AS "bot",
        COUNT(*) FILTER (WHERE "status" = 'HUMAN')::int AS "human"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
        AND "session_name" = ${sessionName}
    `);

    const row = rows[0];
    return { bot: row?.bot ?? 0, human: row?.human ?? 0 };
  }

  async sessionStabilityByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<SessionStabilityPoint[]> {
    // Indice usado: whatsapp_session_events(tenant_id, session_name, occurred_at) — cobre o filtro inteiro.
    const rows = await this.prisma.$queryRaw<SessionStabilityRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "occurred_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*) FILTER (WHERE "status" = 'CONNECTED')::int AS "connected",
        COUNT(*) FILTER (WHERE "status" = 'DISCONNECTED')::int AS "disconnected",
        COUNT(*) FILTER (WHERE "status" = 'CONNECTING')::int AS "connecting"
      FROM "whatsapp_session_events"
      WHERE "tenant_id" = ${tenantId}
        AND "session_name" = ${sessionName}
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

  async pipelineFunnelCounts(tenantId: string, sessionName: string): Promise<PipelineFunnelCounts> {
    // Retrato atual (sem faixa de tempo, mesmo racional de
    // conversationStatusCounts). Reaproveita o indice
    // (tenant_id, session_name, stage) ja existente desde a M6H-5 (Kanban).
    // ADR #94 (2026-08-01): conversas marcadas como fora do funil comercial
    // (amigo/familia/fornecedor) nunca entram na contagem do funil.
    const rows = await this.prisma.$queryRaw<PipelineFunnelCountsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "stage" = 'NEW')::int AS "new",
        COUNT(*) FILTER (WHERE "stage" = 'CONTACTED')::int AS "contacted",
        COUNT(*) FILTER (WHERE "stage" = 'NEGOTIATING')::int AS "negotiating",
        COUNT(*) FILTER (WHERE "stage" = 'CLOSED_WON')::int AS "closed_won",
        COUNT(*) FILTER (WHERE "stage" = 'CLOSED_LOST')::int AS "closed_lost"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
        AND "session_name" = ${sessionName}
        AND "excluded_from_pipeline" = false
    `);

    const row = rows[0];
    return {
      new: row?.new ?? 0,
      contacted: row?.contacted ?? 0,
      negotiating: row?.negotiating ?? 0,
      closed_won: row?.closed_won ?? 0,
      closed_lost: row?.closed_lost ?? 0,
    };
  }

  async escalationRateByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<EscalationRatePoint[]> {
    // Bucket por created_at (data em que a conversa COMECOU), nao por
    // escalated_at — mede "das conversas que nasceram naquele dia, quantas
    // precisaram de humano em algum momento", nao "quantas escaladas
    // aconteceram naquele dia" (ver docstring de EscalationRatePoint).
    // session_name proprio, ja indexado — filtro direto, sem join.
    const rows = await this.prisma.$queryRaw<EscalationRateRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "totalConversations",
        COUNT(*) FILTER (WHERE "escalated_at" IS NOT NULL)::int AS "escalatedConversations"
      FROM "whatsapp_conversations"
      WHERE "tenant_id" = ${tenantId}
        AND "session_name" = ${sessionName}
        AND "created_at" >= ${range.from}
        AND "created_at" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({
      date: row.date,
      totalConversations: row.totalConversations,
      escalatedConversations: row.escalatedConversations,
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

interface PipelineFunnelCountsRow {
  new: number;
  contacted: number;
  negotiating: number;
  closed_won: number;
  closed_lost: number;
}

interface EscalationRateRow {
  date: string;
  totalConversations: number;
  escalatedConversations: number;
}
