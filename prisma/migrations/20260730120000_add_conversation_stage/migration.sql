-- Milestone 6, Bloco M6H-5 (2026-07-30) — pipeline de CRM real: estágio de
-- funil de vendas por conversa. Aditiva, sem backfill de dados especial:
-- toda conversa existente recebe o default `NEW` / `stageSetBy = AI` /
-- `stageUpdatedAt = now()` automaticamente pelos DEFAULTs abaixo — não há
-- forma de inferir retroativamente em que estágio uma conversa já estava,
-- então a IA passa a poder classificar normalmente a partir de agora (não
-- reclassifica histórico nenhum sozinha; só reage a mensagens novas).

-- CreateEnum
CREATE TYPE "conversation_stage" AS ENUM ('NEW', 'CONTACTED', 'NEGOTIATING', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "conversation_stage_set_by" AS ENUM ('AI', 'HUMAN');

-- AlterTable
ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "stage" "conversation_stage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "stage_set_by" "conversation_stage_set_by" NOT NULL DEFAULT 'AI',
  ADD COLUMN "stage_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "whatsapp_conversations_tenant_id_session_name_stage_idx" ON "whatsapp_conversations"("tenant_id", "session_name", "stage");
