-- Fase 1, Bloco F1.1 (2026-07-31) — suporte a mensagens de mídia (ver
-- DECISIONS.md ADR #90). Aditiva, sem backfill: toda linha existente recebe
-- `content_type = TEXT` pelo DEFAULT abaixo, o que é sempre verdade para
-- dados já persistidos (mensagens de mídia eram descartadas em silêncio por
-- `BaileysProvider.handleMessagesUpsert` antes desta migration, nunca
-- chegavam a virar uma `WhatsAppMessage`) — não há dado histórico de mídia
-- para recuperar.

-- CreateEnum
CREATE TYPE "whatsapp_message_content_type" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'STICKER');

-- AlterTable
ALTER TABLE "whatsapp_messages"
  ADD COLUMN "content_type" "whatsapp_message_content_type" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "media_mime_type" TEXT,
  ADD COLUMN "media_url" TEXT,
  ADD COLUMN "media_key_encrypted" TEXT,
  ADD COLUMN "media_file_name" TEXT;
