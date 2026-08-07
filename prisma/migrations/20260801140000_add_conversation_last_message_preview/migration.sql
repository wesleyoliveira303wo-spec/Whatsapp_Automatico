-- Fase 1, Bloco F1.7 (2026-08-01) — prévia da última mensagem na lista de
-- Conversas. Aditiva, sem backfill: conversas existentes começam com
-- `last_message_preview`/`last_message_at` nulos até a próxima mensagem
-- (inbound ou outbound) ser persistida.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_message_preview" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_message_at" TIMESTAMP(3);
