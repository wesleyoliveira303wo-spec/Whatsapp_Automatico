-- Onda 3 do redesign (2026-08-23) — cobre a consulta tenant-wide de
-- `findAllByTenant({needsHumanAttention: true})`: filtra
-- (tenant_id, escalated_at IS NOT NULL) SEM session_name, então o índice
-- (tenant_id, session_name, last_message_at) já existente não serve de
-- prefixo aqui. Consumida por `useWaitingForHuman` (badge "aguardando
-- atendente" da Sidebar), montada duas vezes por página, cada uma com seu
-- próprio polling de ~5s — consulta de alta frequência sem cobertura até
-- esta migration. Só CREATE INDEX — nenhuma coluna/constraint/comportamento
-- alterado, migration 100% aditiva e segura de aplicar em produção.
CREATE INDEX "whatsapp_conversations_tenantId_escalatedAt_idx" ON "whatsapp_conversations"("tenant_id", "escalated_at");
