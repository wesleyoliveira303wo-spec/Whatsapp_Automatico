-- Recorrência de disparo em grupos (2026-09-11) — aditiva, sem backfill:
-- disparos já criados ficam com `recurrence_interval_hours` nulo, ou seja,
-- publicação única, exatamente como antes.
ALTER TABLE "group_broadcasts"
  ADD COLUMN "recurrence_interval_hours" INTEGER,
  ADD COLUMN "recurrence_max_runs" INTEGER,
  ADD COLUMN "recurrence_ends_at" TIMESTAMP(3),
  ADD COLUMN "send_window_start" TEXT,
  ADD COLUMN "send_window_end" TEXT,
  ADD COLUMN "runs_completed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_run_at" TIMESTAMP(3);

ALTER TABLE "group_broadcast_targets"
  ADD COLUMN "sent_count" INTEGER NOT NULL DEFAULT 0;
