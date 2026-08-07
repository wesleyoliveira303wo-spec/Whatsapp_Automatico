-- Fase 1, Bloco F1.4 (2026-08-01) — vínculo AiInteraction -> mensagem
-- inbound (`message_id` já existe, nunca era preenchido) + motivo da
-- escalada. Aditiva, sem backfill: interações antigas ficam com
-- `escalation_reason = NULL` ("não escalou" — indistinguível de uma
-- tentativa anterior a este bloco, aceitável pois o critério de aceite só
-- pede a distinção DAQUI PRA FRENTE).
CREATE TYPE "ai_escalation_reason" AS ENUM ('UNKNOWN_ANSWER', 'REQUESTED_HUMAN');

ALTER TABLE "ai_interactions"
  ADD COLUMN "escalation_reason" "ai_escalation_reason";
