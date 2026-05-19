-- Откат к снимку budget_2026_backup_snapshot_20260519_list1_aligned.sql

BEGIN;

UPDATE public.initiatives i
SET quarterly_data = b.quarterly_data, updated_at = b.updated_at
FROM public._backup_initiatives_quarterly_20260519 b
WHERE i.id = b.id;

DELETE FROM public.initiative_budget_department_2026;
INSERT INTO public.initiative_budget_department_2026
SELECT * FROM public._backup_split_20260519;

DELETE FROM public.team_budget_baseline_2026;
INSERT INTO public.team_budget_baseline_2026
SELECT unit, team, q1, q2, q3, q4, rub_all, rub_pnl_it, frozen_at
FROM public._backup_team_baseline_20260519;

DELETE FROM public.team_budget_manual_truth_2026;
INSERT INTO public.team_budget_manual_truth_2026
SELECT unit, team, q1, q2, q3, q4, rub_all, rub_pnl_it, rub_non_pnl, source_note, csv_initiatives, locked_at
FROM public._backup_team_manual_truth_20260519;

DELETE FROM public.budget_portfolio_anchor_2026;
INSERT INTO public.budget_portfolio_anchor_2026
SELECT id, truth_total_rub, truth_pnl_it_rub, source_note, frozen_at
FROM public._backup_portfolio_anchor_20260519;

SELECT 'restored_20260519' AS status,
  (SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint FROM public.initiatives WHERE deleted_at IS NULL) AS sum_quarterly_after;

-- COMMIT;
ROLLBACK;
