-- Fase L, Bloco L8 (2026-08-20) — mídia opcional anexada a uma campanha.
--
-- Aditiva, 100% nullable: nenhuma campanha existente é afetada. As quatro
-- colunas nascem/são limpas juntas pela aplicação (attachMedia/removeMedia
-- em PrismaCampaignRepository), nunca por CHECK — mesmo espírito já aceito
-- neste schema para outros pares de colunas correlatas (ex.: mediaMimeType/
-- mediaKeyEncrypted em whatsapp_messages).
--
-- "bytea" (Bytes do Prisma) guarda o binário direto em Postgres — decisão
-- deliberada de não introduzir storage de arquivo/volume novo; o teto de
-- tamanho do lado da aplicação (MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES) mantém isso
-- barato mesmo para uma campanha de muitos destinatários.
ALTER TABLE "campaigns" ADD COLUMN "media_content" BYTEA;
ALTER TABLE "campaigns" ADD COLUMN "media_mime_type" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "media_file_name" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "media_content_type" "whatsapp_message_content_type";
