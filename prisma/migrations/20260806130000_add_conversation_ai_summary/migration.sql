-- Redesign 2026-08-05 (R5) — resumo da conversa gerado pela IA sob demanda.
--
-- ADITIVA: três colunas novas em "whatsapp_conversations", todas com default
-- seguro (NULL/0) — nenhuma linha existente precisa de backfill, nenhuma
-- tabela é renomeada ou removida.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "ai_summary_updated_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN "ai_summary_message_count" INTEGER NOT NULL DEFAULT 0;
