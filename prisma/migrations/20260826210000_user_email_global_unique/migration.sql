-- E-mail de User passa a ser unico GLOBALMENTE (nao mais por tenant).
-- Pre-requisito do login por e-mail sem exigir tenantId (Fase Auth/Registro).
-- Seguro: nao ha duas linhas com o mesmo email hoje (conferido antes de
-- escrever esta migration).
DROP INDEX "users_tenant_id_email_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
