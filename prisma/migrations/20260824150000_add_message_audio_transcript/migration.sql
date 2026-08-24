-- Feature de transcrição de áudio (2026-08-24) — aditiva, nullable, sem backfill.
-- Preenchida depois da criação da linha via MessageRepository.setAudioTranscript(),
-- única exceção documentada à imutabilidade de WhatsAppMessage (ver schema.prisma).
ALTER TABLE "whatsapp_messages" ADD COLUMN "audio_transcript" TEXT;
