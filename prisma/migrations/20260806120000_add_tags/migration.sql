-- Redesign 2026-08-05 (R4) — tags livres por sessão + junção N:N com conversas.
--
-- ADITIVA e ISOLADA: cria um enum e DUAS tabelas NOVAS. Nenhuma tabela
-- existente é alterada, renomeada ou removida; nenhum backfill necessário —
-- toda conversa existente simplesmente não tem tags até o operador atribuir.
CREATE TYPE "tag_color" AS ENUM ('GRAY', 'RED', 'ORANGE', 'AMBER', 'GREEN', 'TEAL', 'BLUE', 'PURPLE');

CREATE TABLE "whatsapp_tags" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "tag_color" NOT NULL DEFAULT 'GRAY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_tags_tenant_id_session_name_name_key" ON "whatsapp_tags"("tenant_id", "session_name", "name");
CREATE INDEX "whatsapp_tags_tenant_id_session_name_idx" ON "whatsapp_tags"("tenant_id", "session_name");

ALTER TABLE "whatsapp_tags" ADD CONSTRAINT "whatsapp_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Junção N:N — sem "id" próprio, a chave composta já garante no máximo uma
-- atribuição da mesma tag à mesma conversa (idempotente por construção).
CREATE TABLE "whatsapp_conversation_tags" (
    "conversation_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversation_tags_pkey" PRIMARY KEY ("conversation_id","tag_id")
);

CREATE INDEX "whatsapp_conversation_tags_tag_id_idx" ON "whatsapp_conversation_tags"("tag_id");

ALTER TABLE "whatsapp_conversation_tags" ADD CONSTRAINT "whatsapp_conversation_tags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversation_tags" ADD CONSTRAINT "whatsapp_conversation_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "whatsapp_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
