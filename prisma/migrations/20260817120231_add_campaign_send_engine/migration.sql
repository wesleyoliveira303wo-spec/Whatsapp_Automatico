-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN     "attempted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "campaign_recipients_tenant_id_campaign_id_attempted_at_idx" ON "campaign_recipients"("tenant_id", "campaign_id", "attempted_at");
