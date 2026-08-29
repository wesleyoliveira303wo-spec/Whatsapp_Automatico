-- Auditoria do Perfil (2026-08-28): resumo do negocio (Cerebro da IA),
-- cacheado, gerado automaticamente sempre que o perfil e' salvo de novo
-- (nunca gerado na leitura). Ver `AiBusinessProfileService`/`BusinessSummaryService`.
ALTER TABLE "ai_business_profiles" ADD COLUMN "summary" TEXT;
ALTER TABLE "ai_business_profiles" ADD COLUMN "summary_generated_at" TIMESTAMP(3);
