-- Cérebro da IA v3, Fase 3 (2026-08-26) — "Preferências": controles REAIS
-- de postura/limite operacional da IA, por sessão.
--
-- ADITIVA e ISOLADA: cria uma tabela NOVA. Nenhuma tabela existente é
-- alterada, renomeada ou removida; nenhum backfill necessário. POR SESSÃO
-- (mesmo padrão de AiBusinessProfile, M6H-3) — chave composta única
-- (tenant_id, session_name), no máximo uma linha por sessão.
CREATE TABLE "ai_preferences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "autonomy_level" TEXT NOT NULL DEFAULT 'balanced',
    "max_discount_percent" INTEGER,
    "topics_to_avoid" TEXT,
    "escalate_after_attempts" INTEGER,
    "custom_handoff_message" TEXT,

    CONSTRAINT "ai_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_preferences_tenant_id_session_name_key" ON "ai_preferences"("tenant_id", "session_name");

ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
