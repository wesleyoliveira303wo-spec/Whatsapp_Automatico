-- Fase 1, Bloco F1.10 (estabilidade para beta) — cobre a query real mais
-- executada do produto: listagem/poll de Conversas filtrando por
-- (tenant_id, session_name) e ordenando por last_message_at (ver
-- PrismaConversationRepository.findAllByTenant). Só CREATE INDEX — nenhuma
-- coluna/constraint/comportamento alterado, migration 100% aditiva e segura
-- de aplicar em produção sem downtime perceptível (tabela pequena hoje).
CREATE INDEX "whatsapp_conversations_tenantId_sessionName_lastMessageAt_idx" ON "whatsapp_conversations"("tenant_id", "session_name", "last_message_at");
