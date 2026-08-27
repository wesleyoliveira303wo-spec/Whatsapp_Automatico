-- Reorganizacao Perfil/Configuracoes (2026-08-27): User ganha nome e foto de
-- perfil, ambos opcionais (nao existiam ate aqui).
ALTER TABLE "users" ADD COLUMN "name" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
