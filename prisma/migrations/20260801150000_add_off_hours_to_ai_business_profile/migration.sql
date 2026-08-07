-- F1.8 — Horário de atendimento configurável por sessão (2026-08-01)
-- Extensão aditiva de `ai_business_profiles`: os 6 campos novos têm
-- valores default, então nenhum backfill é necessário — perfis existentes
-- ficam com `off_hours_enabled = false` (feature desligada) e herdam os
-- defaults de horário (09h–18h, Seg–Sex, America/Sao_Paulo), que são
-- inócuos enquanto a feature está desligada.

ALTER TABLE "ai_business_profiles"
  ADD COLUMN "off_hours_enabled"    BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "off_hours_message"    TEXT,
  ADD COLUMN "working_hours_start"  VARCHAR(5),
  ADD COLUMN "working_hours_end"    VARCHAR(5),
  ADD COLUMN "working_days"         INTEGER  NOT NULL DEFAULT 62,
  ADD COLUMN "timezone"             VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo';
