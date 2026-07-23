-- CreateEnum
CREATE TYPE "ai_provider_type" AS ENUM ('CLAUDE', 'OPENAI', 'GEMINI');

-- CreateEnum
CREATE TYPE "ai_interaction_status" AS ENUM ('SUCCESS', 'VALIDATION_REJECTED', 'PROVIDER_ERROR');

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT,
    "provider" "ai_provider_type" NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT NOT NULL,
    "tokens_input" INTEGER NOT NULL,
    "tokens_output" INTEGER NOT NULL,
    "cost_usd" DECIMAL(12,8) NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "status" "ai_interaction_status" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_interactions_tenant_id_conversation_id_created_at_idx" ON "ai_interactions"("tenant_id", "conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
