-- Fase 1 do painel /admin (ADMIN_PLATFORM_MASTER_PLAN.md §15).
-- Aditiva: nenhuma tabela existente é tocada. Reaproveita o enum `UserStatus`
-- já existente (mapeado como `user_status` no Postgres, ver `@@map` no schema)
-- em vez de criar um paralelo.
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- Trilha da plataforma. Sem FK para `platform_users` nem `tenants`: auditoria
-- precisa sobreviver à exclusão do que auditou (mesmo padrão de `audit_logs`).
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tenant_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_occurred_at_idx" ON "platform_audit_logs"("occurred_at");
CREATE INDEX "platform_audit_logs_tenant_id_occurred_at_idx" ON "platform_audit_logs"("tenant_id", "occurred_at");
CREATE INDEX "platform_audit_logs_platform_user_id_occurred_at_idx" ON "platform_audit_logs"("platform_user_id", "occurred_at");
