-- Milestone 6, Bloco M6H-3 (2026-07-25): "Cérebro da IA" migra de 1 perfil
-- por TENANT para 1 perfil por SESSÃO de WhatsApp — cada número atendido
-- pelo Francis pode ter seu próprio contexto de negócio.
--
-- Passo 1: coluna nova NULLABLE (ainda sem dado) — não pode ser NOT NULL de
-- cara porque as linhas existentes (1 por tenant) não têm session_name.
ALTER TABLE "ai_business_profiles" ADD COLUMN "session_name" TEXT;

-- Passo 2: BACKFILL — decisão do fundador: o texto já configurado por cada
-- empresa vira o perfil da sessão MAIS ANTIGA daquele tenant (a que
-- provavelmente foi configurada primeiro). Sessões adicionais (se houver)
-- começam sem perfil (herdam o comportamento genérico da IA até alguém
-- configurar). Usa uma subquery correlacionada com DISTINCT ON, ordenando
-- por created_at (a sessão mais antiga primeiro) — mesmo padrão de "primeira
-- linha por grupo" já resolvido no projeto via ORDER BY + LIMIT em outros
-- contextos, aqui expresso via DISTINCT ON (idiomático do Postgres).
UPDATE "ai_business_profiles" AS profile
SET "session_name" = oldest_session.session_name
FROM (
  SELECT DISTINCT ON ("tenant_id") "tenant_id", "session_name"
  FROM "whatsapp_sessions"
  ORDER BY "tenant_id", "created_at" ASC
) AS oldest_session
WHERE profile."tenant_id" = oldest_session."tenant_id";

-- Passo 3: tenants com perfil configurado mas SEM NENHUMA sessão de WhatsApp
-- ainda (caso de borda: perfil salvo antes de conectar o primeiro número) não
-- têm candidato de backfill — a linha ficaria com session_name NULL para
-- sempre, quebrando o NOT NULL do passo 5. Não há sessão "certa" para um
-- perfil órfão como esse; a linha é removida (o dono simplesmente reconfigura
-- o Cérebro da IA depois de conectar o primeiro WhatsApp — nenhum dado de
-- conversa é afetado, só o texto do perfil).
DELETE FROM "ai_business_profiles" WHERE "session_name" IS NULL;

-- Passo 4: a chave única antiga era um ÍNDICE único sobre (tenant_id) — ver
-- migration original (20260722120000): `CREATE UNIQUE INDEX
-- "ai_business_profiles_tenant_id_key"`, não uma constraint nomeada via ADD
-- CONSTRAINT. Precisa ser um DROP INDEX (não DROP CONSTRAINT) por isso.
DROP INDEX "ai_business_profiles_tenant_id_key";

-- Passo 5: agora que todo profile remanescente tem session_name, torna a
-- coluna obrigatória.
ALTER TABLE "ai_business_profiles" ALTER COLUMN "session_name" SET NOT NULL;

-- Passo 6: novo índice único composto — um perfil por (tenant, sessão). Mesmo
-- padrão do Prisma para `@@unique([a, b])` (CREATE UNIQUE INDEX, não uma
-- constraint de tabela).
CREATE UNIQUE INDEX "ai_business_profiles_tenant_id_session_name_key" ON "ai_business_profiles"("tenant_id", "session_name");
