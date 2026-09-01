-- Trava de plano (Lancamento suave, 2026-08-31): todo tenant tem um plano.
-- Novos e existentes nascem 'FREE'; ativar Pro/Enterprise e manual (script
-- setTenantPlan) enquanto nao ha billing automatico.
CREATE TYPE "tenant_plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

ALTER TABLE "tenants" ADD COLUMN "plan" "tenant_plan" NOT NULL DEFAULT 'FREE';
