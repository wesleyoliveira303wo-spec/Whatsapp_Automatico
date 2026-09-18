-- B5 (2026-09-18): plano Disparos (tudo menos IA). Migration propria porque
-- o Postgres nao deixa usar um valor novo de enum na mesma transacao que o
-- criou.
ALTER TYPE "tenant_plan" ADD VALUE IF NOT EXISTS 'BROADCAST' AFTER 'FREE';
