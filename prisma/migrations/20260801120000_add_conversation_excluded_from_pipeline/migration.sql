-- ADR #94 (2026-08-01, validação Fase 1) — flag para excluir uma conversa
-- do funil comercial (amigo/família/fornecedor/funcionário falando no mesmo
-- número da empresa). Aditiva, com default, sem backfill necessário: toda
-- conversa existente passa a ter `excluded_from_pipeline = false`, mesmo
-- comportamento de sempre.
ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "excluded_from_pipeline" BOOLEAN NOT NULL DEFAULT false;
