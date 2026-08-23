-- Reorganização Contatos/Campanhas (2026-08-17)
--
-- Separa de vez "Contato CRM" de "Destinatário de campanha": um destinatário
-- vindo de planilha/lista colada não precisa mais corresponder a um
-- `WhatsAppContact` já existente. `contact_id` vira opcional; `phone_e164`/
-- `name` guardam o retrato do destinatário quando não há Contato vinculado.
-- Nenhum dado existente é alterado — todo `CampaignRecipient` já materializado
-- continua com `contact_id` preenchido (só ficou opcional daqui pra frente).

-- 1. `contact_id` deixa de ser obrigatório.
ALTER TABLE "campaign_recipients" ALTER COLUMN "contact_id" DROP NOT NULL;

-- 2. Novos campos para o destinatário "solto" (sem Contato).
ALTER TABLE "campaign_recipients" ADD COLUMN "phone_e164" TEXT;
ALTER TABLE "campaign_recipients" ADD COLUMN "name" TEXT;

-- 3. Descrição opcional da campanha.
ALTER TABLE "campaigns" ADD COLUMN "description" TEXT;

-- 4. Toda linha precisa ter um jeito de identificar quem é o destinatário —
--    ou um Contato vinculado, ou um telefone próprio. As duas colunas nunca
--    podem estar vazias ao mesmo tempo (a aplicação já garante isso; o CHECK
--    é a rede de segurança no nível do banco).
ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipients_identity_check"
  CHECK ("contact_id" IS NOT NULL OR "phone_e164" IS NOT NULL);

-- 5. Idempotência de materialização para o caminho sem Contato: mesmo
--    telefone não duplica dentro da mesma campanha (mesmo racional do
--    `@@unique([campaignId, contactId])` já existente).
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_phone_e164_key"
  ON "campaign_recipients" ("campaign_id", "phone_e164");
