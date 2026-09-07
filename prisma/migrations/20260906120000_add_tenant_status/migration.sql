-- Painel /admin, Fase 4 (ADMIN_PLATFORM_MASTER_PLAN.md §8/§15) — primeira
-- ESCRITA cross-tenant. Aditiva: `plan` continua respondendo "o que ele pode
-- fazer"; `status` passa a responder "ele pode entrar". Reaproveita o enum
-- `user_status` já existente (mesmo critério da migration da Fase 1), em vez
-- de criar um enum paralelo com os mesmos dois valores.
ALTER TABLE "tenants" ADD COLUMN "status" "user_status" NOT NULL DEFAULT 'ACTIVE';
