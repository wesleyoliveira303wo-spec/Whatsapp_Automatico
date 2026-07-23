-- CreateEnum
CREATE TYPE "whatsapp_conversation_status" AS ENUM ('BOT', 'HUMAN');

-- CreateEnum
CREATE TYPE "whatsapp_message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "contact_jid" TEXT NOT NULL,
    "status" "whatsapp_conversation_status" NOT NULL DEFAULT 'BOT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "whatsapp_message_direction" NOT NULL,
    "content" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversations_tenant_id_idx" ON "whatsapp_conversations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_tenant_id_session_name_contact_jid_key" ON "whatsapp_conversations"("tenant_id", "session_name", "contact_jid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversation_id_occurred_at_idx" ON "whatsapp_messages"("conversation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_tenant_id_idx" ON "whatsapp_messages"("tenant_id");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
