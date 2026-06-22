-- Эталон бюджета 2026: глобальные якоря (2111 / PnL IT) и суммы по HR-команде (unit + team).
-- Заполняется scripts/sql/budget_2026_freeze_team_baselines_from_truth.sql (CSV + MAP, без cost/коэффициентов).

CREATE TABLE IF NOT EXISTS public.budget_portfolio_anchor_2026 (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  truth_total_rub bigint NOT NULL,
  truth_pnl_it_rub bigint NOT NULL,
  source_note text NOT NULL DEFAULT 'csv_truth_map',
  frozen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.team_budget_baseline_2026 (
  unit text NOT NULL,
  team text NOT NULL,
  q1 bigint NOT NULL DEFAULT 0,
  q2 bigint NOT NULL DEFAULT 0,
  q3 bigint NOT NULL DEFAULT 0,
  q4 bigint NOT NULL DEFAULT 0,
  rub_all bigint NOT NULL DEFAULT 0,
  rub_pnl_it bigint NOT NULL DEFAULT 0,
  frozen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (unit, team)
);

CREATE INDEX IF NOT EXISTS idx_team_budget_baseline_2026_unit
  ON public.team_budget_baseline_2026 (unit);

ALTER TABLE public.budget_portfolio_anchor_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_budget_baseline_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dodo employees can view budget_portfolio_anchor_2026"
  ON public.budget_portfolio_anchor_2026;
CREATE POLICY "Dodo employees can view budget_portfolio_anchor_2026"
  ON public.budget_portfolio_anchor_2026 FOR SELECT
  USING (public.is_dodo_employee());

DROP POLICY IF EXISTS "Dodo employees can view team_budget_baseline_2026"
  ON public.team_budget_baseline_2026;
CREATE POLICY "Dodo employees can view team_budget_baseline_2026"
  ON public.team_budget_baseline_2026 FOR SELECT
  USING (public.is_dodo_employee());
