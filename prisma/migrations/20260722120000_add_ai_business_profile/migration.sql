-- Base de Conhecimento (Nivel 1) — "Cerebro da IA" por empresa.
--
-- ADITIVA e ISOLADA: cria uma tabela NOVA. Nenhuma tabela existente e
-- alterada, renomeada ou removida; nenhum backfill necessario. Tenants sem
-- perfil simplesmente nao tem linha aqui (a IA segue com o prompt generico +
-- escalonamento, comportamento atual).
--
-- `tenant_id` UNIQUE: relacao 1:1 com tenants (no maximo um perfil por
-- empresa). ON DELETE CASCADE: apagar um tenant apaga seu perfil junto.
CREATE TABLE "ai_business_profiles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_business_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_business_profiles_tenant_id_key" ON "ai_business_profiles"("tenant_id");

ALTER TABLE "ai_business_profiles" ADD CONSTRAINT "ai_business_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
