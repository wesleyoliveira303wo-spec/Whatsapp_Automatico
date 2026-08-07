-- Milestone 6, Bloco M6H-2b: nome de exibicao do WhatsApp (pushName) por conversa.
--
-- ADITIVA e SEGURA: coluna nova NULLABLE, sem DEFAULT NOT NULL. Todas as
-- conversas existentes ficam com contact_name = NULL (comportamento atual:
-- a UI cai de volta para o numero formatado, ver ConversationListItem/
-- ConversationDetailPanel). Nenhuma coluna e removida ou renomeada; nenhum
-- backfill necessario (nao ha como recuperar o pushName de mensagens ja
-- processadas antes deste bloco).
ALTER TABLE "whatsapp_conversations" ADD COLUMN "contact_name" TEXT;
