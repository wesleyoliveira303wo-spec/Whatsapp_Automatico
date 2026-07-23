-- CreateTable
CREATE TABLE "whatsapp_session_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "status" "whatsapp_session_status" NOT NULL,
    "disconnect_reason" "whatsapp_disconnect_reason",
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_session_events_tenant_id_session_name_occurred_at_idx" ON "whatsapp_session_events"("tenant_id", "session_name", "occurred_at");

-- AddForeignKey
ALTER TABLE "whatsapp_session_events" ADD CONSTRAINT "whatsapp_session_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
