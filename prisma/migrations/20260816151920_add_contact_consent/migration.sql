-- CreateEnum
CREATE TYPE "consent_event_type" AS ENUM ('OPT_IN', 'OPT_OUT');

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "opt_out_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "contact_consent_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "type" "consent_event_type" NOT NULL,
    "reason" TEXT,
    "actor_user_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_consent_events_tenant_id_contact_id_occurred_at_idx" ON "contact_consent_events"("tenant_id", "contact_id", "occurred_at");

-- CreateIndex
CREATE INDEX "whatsapp_contacts_tenant_id_opt_out_at_idx" ON "whatsapp_contacts"("tenant_id", "opt_out_at");

-- AddForeignKey
ALTER TABLE "contact_consent_events" ADD CONSTRAINT "contact_consent_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
