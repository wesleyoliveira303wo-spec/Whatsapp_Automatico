-- Onda 3 do redesign (2026-08-24, P2) — remove o domínio legado
-- "Conversations" da Milestone 003 (congelado desde DECISIONS.md ADR #11,
-- nunca migrado para o domínio real de produção). Confirmado antes desta
-- migration, por dois caminhos independentes:
--   1. Busca em todo o repositório (`apps/`) por qualquer uso de
--      `prisma.contact`/`prisma.conversation`/`prisma.message`/
--      `prisma.attachment`/`prisma.tag`/`prisma.conversationTag`/
--      `prisma.internalNote`/`prisma.conversationEvent` — zero ocorrências.
--   2. Contagem direta no Postgres de produção — as 8 tabelas abaixo
--      estavam com 0 linhas cada.
--
-- Ordem de DROP respeita as foreign keys (filhas antes das pais); CASCADE
-- por segurança (remove também os índices/constraints associados), não
-- porque haja qualquer dependência externa inesperada.
DROP TABLE IF EXISTS "Attachment" CASCADE;
DROP TABLE IF EXISTS "ConversationTag" CASCADE;
DROP TABLE IF EXISTS "InternalNote" CASCADE;
DROP TABLE IF EXISTS "ConversationEvent" CASCADE;
DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "Conversation" CASCADE;
DROP TABLE IF EXISTS "Tag" CASCADE;
DROP TABLE IF EXISTS "Contact" CASCADE;

-- Os enums só podem ser removidos depois de nenhuma coluna os referenciar
-- mais — garantido pelos DROPs de tabela acima.
DROP TYPE IF EXISTS "ConversationStatus";
DROP TYPE IF EXISTS "MessageDirection";
DROP TYPE IF EXISTS "MessageType";
DROP TYPE IF EXISTS "MessageStatus";
DROP TYPE IF EXISTS "ConversationEventType";
