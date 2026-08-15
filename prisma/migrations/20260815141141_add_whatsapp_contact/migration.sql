-- CreateEnum
CREATE TYPE "contact_source" AS ENUM ('WHATSAPP', 'IMPORT', 'MANUAL');

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "contact_id" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT,
    "source" "contact_source" NOT NULL DEFAULT 'WHATSAPP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_contacts_tenant_id_idx" ON "whatsapp_contacts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_tenant_id_phone_e164_key" ON "whatsapp_contacts"("tenant_id", "phone_e164");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_contact_id_idx" ON "whatsapp_conversations"("contact_id");

-- AddForeignKey
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "whatsapp_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "whatsapp_conversations_tenantId_sessionName_lastMessageAt_idx" RENAME TO "whatsapp_conversations_tenant_id_session_name_last_message__idx";
