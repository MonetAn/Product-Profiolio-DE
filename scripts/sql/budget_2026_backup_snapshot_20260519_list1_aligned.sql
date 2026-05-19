-- Снимок прод: 2026-05-19 — LIST1 сходится (2111 / 2038 PnL), большинство команд заполнены в админке.
-- Run в Supabase SQL Editor (postgres), Ctrl+A. COMMIT в конце.
-- Откат: budget_2026_restore_from_backup_snapshot_20260519.sql

BEGIN;

DROP TABLE IF EXISTS public._backup_initiatives_quarterly_20260519;
CREATE TABLE public._backup_initiatives_quarterly_20260519 AS
SELECT id, unit, team, initiative, is_timeline_stub, quarterly_data, updated_at
FROM public.initiatives
WHERE deleted_at IS NULL;

DROP TABLE IF EXISTS public._backup_split_20260519;
CREATE TABLE public._backup_split_20260519 AS
SELECT b.*
FROM public.initiative_budget_department_2026 b
INNER JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL;

DROP TABLE IF EXISTS public._backup_team_baseline_20260519;
CREATE TABLE public._backup_team_baseline_20260519 AS
SELECT * FROM public.team_budget_baseline_2026;

DROP TABLE IF EXISTS public._backup_team_manual_truth_20260519;
CREATE TABLE public._backup_team_manual_truth_20260519 AS
SELECT * FROM public.team_budget_manual_truth_2026;

DROP TABLE IF EXISTS public._backup_portfolio_anchor_20260519;
CREATE TABLE public._backup_portfolio_anchor_20260519 AS
SELECT * FROM public.budget_portfolio_anchor_2026;

COMMENT ON TABLE public._backup_initiatives_quarterly_20260519 IS
  'Backup 2026-05-19: initiatives.quarterly_data после finish_to_list1 + sync_split';
COMMENT ON TABLE public._backup_split_20260519 IS
  'Backup 2026-05-19: initiative_budget_department_2026';
COMMENT ON TABLE public._backup_team_baseline_20260519 IS
  'Backup 2026-05-19: team_budget_baseline_2026 (LIST1)';
COMMENT ON TABLE public._backup_team_manual_truth_20260519 IS
  'Backup 2026-05-19: team_budget_manual_truth_2026';
COMMENT ON TABLE public._backup_portfolio_anchor_20260519 IS
  'Backup 2026-05-19: budget_portfolio_anchor_2026 (2111435636 / 2038870010)';

SELECT
  '2026-05-19 list1_aligned' AS snapshot_label,
  (SELECT count(*)::int FROM public._backup_initiatives_quarterly_20260519) AS initiatives,
  (SELECT count(*)::int FROM public._backup_split_20260519) AS split_rows,
  (SELECT count(*)::int FROM public._backup_team_baseline_20260519) AS team_baselines,
  (SELECT truth_total_rub FROM public._backup_portfolio_anchor_20260519 WHERE id = 1) AS anchor_all,
  (SELECT truth_pnl_it_rub FROM public._backup_portfolio_anchor_20260519 WHERE id = 1) AS anchor_pnl,
  (SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint FROM public._backup_initiatives_quarterly_20260519) AS sum_quarterly,
  (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
   FROM public._backup_split_20260519 b) AS sum_split;

COMMIT;
