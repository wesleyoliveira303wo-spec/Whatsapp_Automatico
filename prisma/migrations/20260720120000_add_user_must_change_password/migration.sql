-- Milestone 5, Bloco M5E: senha provisoria definida por um admin.
--
-- ADITIVA e SEGURA: coluna nova com DEFAULT false, portanto todas as linhas
-- existentes (inclusive o OWNER criado pelo script `createOwner.ts`) continuam
-- validas e NAO passam a exigir troca de senha. Nenhuma coluna e removida ou
-- renomeada; nenhum backfill necessario.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
