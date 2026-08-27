-- Cérebro da IA v3, Fase 2 (2026-08-25) — FAQ estruturada por sessão,
-- substituindo o antigo "anexar texto cru" ao blob de AiBusinessProfile.
--
-- ADITIVA e ISOLADA: cria uma tabela NOVA. Nenhuma tabela existente é
-- alterada, renomeada ou removida; nenhum backfill necessário. POR SESSÃO
-- (mesmo padrão de QuickReply) — índice composto (não único: várias
-- perguntas por sessão).
CREATE TABLE "ai_faq_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_faq_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_faq_entries_tenant_id_session_name_idx" ON "ai_faq_entries"("tenant_id", "session_name");

ALTER TABLE "ai_faq_entries" ADD CONSTRAINT "ai_faq_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
