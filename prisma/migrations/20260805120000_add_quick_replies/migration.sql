-- Fase 1, Bloco F1.9 — respostas rapidas (templates) para o atendente humano.
--
-- ADITIVA e ISOLADA: cria uma tabela NOVA. Nenhuma tabela existente e
-- alterada, renomeada ou removida; nenhum backfill necessario. POR SESSAO
-- (nao 1:1 por tenant como AiBusinessProfile) — indice composto (nao unico:
-- varias respostas por sessao).
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_replies_tenant_id_session_name_idx" ON "quick_replies"("tenant_id", "session_name");

ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
