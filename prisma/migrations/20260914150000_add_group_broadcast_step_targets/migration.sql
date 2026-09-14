-- Cadência entre publicações (2026-09-14): as etapas de um disparo em grupos
-- passam a rodar em PARALELO (cada uma com seu próprio ritmo), em vez de uma
-- de cada vez. Isso exige progresso de envio POR ETAPA, não mais só por
-- campanha — daí a nova tabela `group_broadcast_step_targets`.

-- 1. `current_step_index` deixa de fazer sentido (não existe mais "a etapa
--    atual" — todas correm ao mesmo tempo).
ALTER TABLE "group_broadcasts" DROP COLUMN "current_step_index";

-- 2. Escalonamento inicial configurável: minutos entre o início de uma
--    publicação e o início da seguinte, na primeira vez que cada uma dispara.
ALTER TABLE "group_broadcasts" ADD COLUMN "step_launch_offset_minutes" INTEGER;

-- 3. Nova tabela: progresso de UM grupo em UMA etapa específica.
CREATE TABLE "group_broadcast_step_targets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" "group_broadcast_target_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "attempted_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_broadcast_step_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_broadcast_step_targets_step_id_target_id_key"
    ON "group_broadcast_step_targets"("step_id", "target_id");
CREATE INDEX "group_broadcast_step_targets_tenant_id_broadcast_id_status_idx"
    ON "group_broadcast_step_targets"("tenant_id", "broadcast_id", "status");
CREATE INDEX "group_broadcast_step_targets_tenant_id_broadcast_id_attempted_a_idx"
    ON "group_broadcast_step_targets"("tenant_id", "broadcast_id", "attempted_at");
CREATE INDEX "group_broadcast_step_targets_tenant_id_step_id_status_idx"
    ON "group_broadcast_step_targets"("tenant_id", "step_id", "status");

ALTER TABLE "group_broadcast_step_targets"
    ADD CONSTRAINT "group_broadcast_step_targets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_broadcast_step_targets"
    ADD CONSTRAINT "group_broadcast_step_targets_step_id_fkey"
    FOREIGN KEY ("step_id") REFERENCES "group_broadcast_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_broadcast_step_targets"
    ADD CONSTRAINT "group_broadcast_step_targets_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "group_broadcast_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill: para cada (etapa, alvo) existente, materializa uma linha de
--    progresso — espelhando o status/skip atual do alvo campanha-wide (a
--    única campanha real em produção neste momento tem 1 etapa "ativa" pelo
--    modelo antigo; as demais nunca começaram, então nascem PENDING/SKIPPED
--    exatamente como o alvo campanha-wide já está).
INSERT INTO "group_broadcast_step_targets"
    ("id", "tenant_id", "broadcast_id", "step_id", "target_id", "status", "error_message", "sent_at", "attempted_at", "sent_count", "created_at")
SELECT
    gen_random_uuid(),
    t."tenant_id",
    t."broadcast_id",
    s."id",
    t."id",
    t."status",
    t."error_message",
    t."sent_at",
    t."attempted_at",
    CASE WHEN s."order" = 0 THEN t."sent_count" ELSE 0 END,
    now()
FROM "group_broadcast_targets" t
JOIN "group_broadcast_steps" s ON s."broadcast_id" = t."broadcast_id";
