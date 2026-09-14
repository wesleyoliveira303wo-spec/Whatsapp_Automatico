-- Etapa 1: tabela nova
CREATE TABLE "group_broadcast_steps" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "broadcast_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "message_template" TEXT NOT NULL,
  "media_content" BYTEA,
  "media_mime_type" TEXT,
  "media_file_name" TEXT,
  "media_content_type" "whatsapp_message_content_type",
  "recurrence_interval_hours" INTEGER,
  "recurrence_max_runs" INTEGER,
  "recurrence_ends_at" TIMESTAMP(3),
  "runs_completed" INTEGER NOT NULL DEFAULT 0,
  "next_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "group_broadcast_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_broadcast_steps_broadcast_id_order_key"
  ON "group_broadcast_steps"("broadcast_id", "order");
CREATE INDEX "group_broadcast_steps_tenant_id_broadcast_id_idx"
  ON "group_broadcast_steps"("tenant_id", "broadcast_id");

ALTER TABLE "group_broadcast_steps"
  ADD CONSTRAINT "group_broadcast_steps_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_broadcast_steps"
  ADD CONSTRAINT "group_broadcast_steps_broadcast_id_fkey"
  FOREIGN KEY ("broadcast_id") REFERENCES "group_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Etapa 2: nova coluna em group_broadcasts (default 0 cobre as linhas existentes)
ALTER TABLE "group_broadcasts" ADD COLUMN "current_step_index" INTEGER NOT NULL DEFAULT 0;

-- Etapa 3: BACKFILL — cada disparo existente vira uma campanha de 1 etapa
-- (order 0), carregando exatamente o conteúdo/recorrência que já tinha.
-- gen_random_uuid() é nativo do Postgres 13+ (sem extensão) — a imagem deste
-- projeto é `postgres:15-alpine`.
INSERT INTO "group_broadcast_steps" (
  "id", "tenant_id", "broadcast_id", "order", "message_template",
  "media_content", "media_mime_type", "media_file_name", "media_content_type",
  "recurrence_interval_hours", "recurrence_max_runs", "recurrence_ends_at",
  "runs_completed", "next_run_at", "created_at"
)
SELECT
  gen_random_uuid(), "tenant_id", "id", 0, "message_template",
  "media_content", "media_mime_type", "media_file_name", "media_content_type",
  "recurrence_interval_hours", "recurrence_max_runs", "recurrence_ends_at",
  "runs_completed", "next_run_at", "created_at"
FROM "group_broadcasts";

-- Etapa 4: as colunas antigas saem de group_broadcasts — o conteúdo já mora
-- na etapa 0 de cada uma (backfill acima já rodou).
ALTER TABLE "group_broadcasts"
  DROP COLUMN "message_template",
  DROP COLUMN "media_content",
  DROP COLUMN "media_mime_type",
  DROP COLUMN "media_file_name",
  DROP COLUMN "media_content_type",
  DROP COLUMN "recurrence_interval_hours",
  DROP COLUMN "recurrence_max_runs",
  DROP COLUMN "recurrence_ends_at",
  DROP COLUMN "runs_completed",
  DROP COLUMN "next_run_at";
