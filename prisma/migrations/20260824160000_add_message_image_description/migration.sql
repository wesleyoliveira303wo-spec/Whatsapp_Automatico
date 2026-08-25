-- Feature de descrição de imagem (2026-08-24) — aditiva, nullable, sem backfill.
-- Mesmo mecanismo de audio_transcript: preenchida depois da criação da linha via
-- MessageRepository.setImageDescription().
ALTER TABLE "whatsapp_messages" ADD COLUMN "image_description" TEXT;
