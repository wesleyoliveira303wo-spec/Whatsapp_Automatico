-- Disparos em grupos de WhatsApp (2026-09-11) — migration ADITIVA: duas
-- tabelas novas + um enum novo, nenhuma tabela existente alterada.
-- `status` reaproveita o enum `campaign_status` (mesmo ciclo de vida de
-- campanha); a mídia reaproveita `whatsapp_message_content_type` (mesmo
-- formato do Bloco L8). Ver docstring de `GroupBroadcast` no schema.prisma.

-- CreateEnum
CREATE TYPE "group_broadcast_target_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "group_broadcasts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message_template" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "paused_reason" TEXT,
    "created_by_user_id" TEXT,
    "media_content" BYTEA,
    "media_mime_type" TEXT,
    "media_file_name" TEXT,
    "media_content_type" "whatsapp_message_content_type",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_broadcast_targets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "group_jid" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "status" "group_broadcast_target_status" NOT NULL DEFAULT 'PENDING',
    "skip_reason" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_broadcast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_broadcasts_tenant_id_session_name_status_idx" ON "group_broadcasts"("tenant_id", "session_name", "status");

-- CreateIndex
CREATE INDEX "group_broadcast_targets_tenant_id_broadcast_id_status_idx" ON "group_broadcast_targets"("tenant_id", "broadcast_id", "status");

-- CreateIndex
CREATE INDEX "group_broadcast_targets_tenant_id_broadcast_id_attempted_at_idx" ON "group_broadcast_targets"("tenant_id", "broadcast_id", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_broadcast_targets_broadcast_id_group_jid_key" ON "group_broadcast_targets"("broadcast_id", "group_jid");

-- AddForeignKey
ALTER TABLE "group_broadcasts" ADD CONSTRAINT "group_broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_targets" ADD CONSTRAINT "group_broadcast_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_broadcast_targets" ADD CONSTRAINT "group_broadcast_targets_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "group_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
