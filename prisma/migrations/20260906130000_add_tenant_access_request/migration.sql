-- Painel /admin, Fase 5 (ADMIN_PLATFORM_MASTER_PLAN.md §9) — acesso assistido
-- ao tenant com consentimento. Aditiva: nenhuma tabela existente é tocada.
-- Sem FK para `tenants`/`users` (mesmo padrão de `platform_audit_logs`): o
-- registro é mantido para sempre e sobrevive à exclusão do que descreve.
CREATE TYPE "support_access_status" AS ENUM (
  'PENDING', 'ACCEPTED', 'DENIED', 'EXPIRED', 'REVOKED', 'ENDED'
);

CREATE TABLE "tenant_access_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "support_access_status" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "responded_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "tenant_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_access_requests_tenant_id_status_requested_at_idx" ON "tenant_access_requests"("tenant_id", "status", "requested_at");
CREATE INDEX "tenant_access_requests_status_expires_at_idx" ON "tenant_access_requests"("status", "expires_at");
