-- B5 (2026-09-18): origem do plano. Os tenants pagos que ja existem foram
-- ativados a mao pelo fundador, entao nascem MANUAL — o Stripe nunca altera um
-- plano manual. Os Gratis ficam SELF_SERVICE e poderao assinar sozinhos.
CREATE TYPE "plan_source" AS ENUM ('SELF_SERVICE', 'MANUAL');

ALTER TABLE "tenants"
  ADD COLUMN "plan_source" "plan_source" NOT NULL DEFAULT 'SELF_SERVICE';

UPDATE "tenants" SET "plan_source" = 'MANUAL' WHERE "plan" <> 'FREE';
