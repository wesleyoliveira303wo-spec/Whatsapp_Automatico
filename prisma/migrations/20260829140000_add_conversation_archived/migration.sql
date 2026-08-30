-- Menu "⋮" da conversa (2026-08-29) — "Arquivar" some da lista principal
-- de Conversas sem apagar nada (histórico continua 100% acessível), mesmo
-- racional de `excluded_from_pipeline` (ADR #94): atributo ORTOGONAL, só
-- filtro, nunca exclusão de dado. `archived_at` acompanha, mesmo padrão de
-- `escalated_at`.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "archived_at" TIMESTAMP(3);
