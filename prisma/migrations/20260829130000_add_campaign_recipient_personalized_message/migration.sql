-- Campanha com mensagem personalizada por lead (2026-08-29): quando
-- presente, este texto substitui `Campaign.messageTemplate` só para este
-- destinatário — ver docstring de `CampaignSendJobProcessor.process`.
ALTER TABLE "campaign_recipients" ADD COLUMN "personalized_message" TEXT;
