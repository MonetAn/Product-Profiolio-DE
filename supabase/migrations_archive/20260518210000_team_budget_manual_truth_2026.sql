-- Ручной эталон стоимостей команд 2026 (не трогать автоматически).
-- Источник: scripts/out/manual-team-truth/*.json
-- Откат к эталону: scripts/sql/team_budget_apply_manual_truth_2026.sql

CREATE TABLE IF NOT EXISTS public.team_budget_manual_truth_2026 (
  unit text NOT NULL,
  team text NOT NULL,
  q1 bigint NOT NULL DEFAULT 0,
  q2 bigint NOT NULL DEFAULT 0,
  q3 bigint NOT NULL DEFAULT 0,
  q4 bigint NOT NULL DEFAULT 0,
  rub_all bigint NOT NULL DEFAULT 0,
  rub_pnl_it bigint NOT NULL DEFAULT 0,
  rub_non_pnl bigint NOT NULL DEFAULT 0,
  source_note text,
  csv_initiatives jsonb,
  locked_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (unit, team)
);

CREATE INDEX IF NOT EXISTS idx_team_budget_manual_truth_2026_unit
  ON public.team_budget_manual_truth_2026 (unit);

COMMENT ON TABLE public.team_budget_manual_truth_2026 IS
  'Зафиксированные вручную суммы команд из CSV; эталон для baseline и отката.';

ALTER TABLE public.team_budget_manual_truth_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dodo employees can view team_budget_manual_truth_2026"
  ON public.team_budget_manual_truth_2026;
CREATE POLICY "Dodo employees can view team_budget_manual_truth_2026"
  ON public.team_budget_manual_truth_2026 FOR SELECT
  USING (public.is_dodo_employee());
