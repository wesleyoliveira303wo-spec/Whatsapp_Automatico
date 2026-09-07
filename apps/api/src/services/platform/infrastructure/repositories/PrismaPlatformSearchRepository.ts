import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import {
  PlatformSearchRepository,
  RawSearchHit,
  RawSearchHits,
} from '../../domain/repositories/PlatformSearchRepository';

interface Row {
  id: string;
  primary: string;
  tenantId: string;
  tenantName: string;
}

/**
 * Implementação Prisma da busca global (Fase 6, §7). Cinco consultas
 * `$queryRaw` parametrizadas (D51 — nunca concatenação), uma por tipo, em
 * paralelo, cada uma com `LIMIT`. `ILIKE` com `%…%`: as tabelas do painel são
 * pequenas (dezenas a centenas de linhas) e o `LIMIT` fecha o custo — o plano
 * mestre pede exatamente isto ("`ILIKE` sobre colunas já indexadas, teto de
 * resultados", sem motor de busca novo).
 *
 * Só colunas de IDENTIDADE (nome, e-mail, telefone, id). NENHUMA consulta
 * toca `whatsapp_messages`/`whatsapp_conversations` (§7 — a busca nunca
 * devolve conteúdo de conversa).
 */
export class PrismaPlatformSearchRepository implements PlatformSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(term: string, digits: string, limit: number): Promise<RawSearchHits> {
    const like = `%${term}%`;
    // Só casa telefone por dígitos quando há dígitos suficientes para não
    // devolver "meio banco" com um `1` digitado.
    const phoneDigits = digits.length >= 4 ? `%${digits}%` : null;

    const [tenants, users, contacts, sessions, campaigns] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "id", "name" AS "primary", "id" AS "tenantId", "name" AS "tenantName"
        FROM "tenants"
        WHERE "name" ILIKE ${like} OR "id"::text ILIKE ${like}
        ORDER BY "name" ASC
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT u."id",
               COALESCE(NULLIF(btrim(u."name"), ''), u."email") AS "primary",
               u."tenant_id" AS "tenantId", t."name" AS "tenantName"
        FROM "users" u
        JOIN "tenants" t ON t."id" = u."tenant_id"
        WHERE u."email" ILIKE ${like} OR u."name" ILIKE ${like} OR u."id"::text ILIKE ${like}
        ORDER BY u."email" ASC
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT c."id",
               COALESCE(NULLIF(btrim(c."name"), ''), c."phone_e164") AS "primary",
               c."tenant_id" AS "tenantId", t."name" AS "tenantName"
        FROM "whatsapp_contacts" c
        JOIN "tenants" t ON t."id" = c."tenant_id"
        WHERE c."name" ILIKE ${like}
           OR c."phone_e164" ILIKE ${like}
           OR c."id"::text ILIKE ${like}
           OR (${phoneDigits}::text IS NOT NULL
               AND regexp_replace(c."phone_e164", '\\D', '', 'g') ILIKE ${phoneDigits})
        ORDER BY c."phone_e164" ASC
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT s."id", s."session_name" AS "primary",
               s."tenant_id" AS "tenantId", t."name" AS "tenantName"
        FROM "whatsapp_sessions" s
        JOIN "tenants" t ON t."id" = s."tenant_id"
        WHERE s."session_name" ILIKE ${like}
           OR s."phone_number" ILIKE ${like}
           OR s."id"::text ILIKE ${like}
        ORDER BY s."session_name" ASC
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ca."id", ca."name" AS "primary",
               ca."tenant_id" AS "tenantId", t."name" AS "tenantName"
        FROM "campaigns" ca
        JOIN "tenants" t ON t."id" = ca."tenant_id"
        WHERE ca."name" ILIKE ${like} OR ca."id"::text ILIKE ${like}
        ORDER BY ca."created_at" DESC
        LIMIT ${limit}
      `),
    ]);

    return {
      tenant: tenants.map((r) => toHit('tenant', r)),
      user: users.map((r) => toHit('user', r)),
      contact: contacts.map((r) => toHit('contact', r)),
      session: sessions.map((r) => toHit('session', r)),
      campaign: campaigns.map((r) => toHit('campaign', r)),
    };
  }
}

function toHit(kind: RawSearchHit['kind'], row: Row): RawSearchHit {
  return {
    kind,
    id: row.id,
    primary: row.primary,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
  };
}
