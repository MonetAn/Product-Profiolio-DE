-- Детальная диагностика расхождения с LIST1 (2 111 435 636 / 2 038 870 010).
-- Только SELECT. Запускать целиком.

-- 1) Портфель целиком
SELECT
  2111435636::bigint AS list1_all_rub,
  2038870010::bigint AS list1_pnl_it_rub,
  (SELECT truth_total_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_all,
  (SELECT sum(rub_all) FROM public.team_budget_baseline_2026) AS sum_team_baselines,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS sum_live_quarterly_cost,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS gap_all_rub;

-- 2) Команды с расхождением live vs team_budget_baseline_2026 (> 1 000 ₽)
SELECT
  b.unit,
  b.team,
  b.rub_all AS baseline_year,
  coalesce(t.live_year, 0)::bigint AS live_year,
  (b.rub_all - coalesce(t.live_year, 0))::bigint AS gap,
  round(100.0 * coalesce(t.live_year, 0) / nullif(b.rub_all, 0), 1) AS live_pct_of_baseline
FROM public.team_budget_baseline_2026 b
LEFT JOIN (
  SELECT
    i.unit,
    i.team,
    sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ) AS live_year
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE abs(b.rub_all - coalesce(t.live_year, 0)) > 1000
ORDER BY abs(b.rub_all - coalesce(t.live_year, 0)) DESC;

-- 3) Удалённые инициативы с «потерянным» бюджетом (последний old из audit)
WITH deleted AS (
  SELECT
    i.id,
    i.unit,
    i.team,
    i.initiative,
    i.deleted_at,
    (
      SELECT a.diff->'quarterly_data'->'old'
      FROM public.db_audit_log a
      WHERE a.source_table = 'public.initiatives'
        AND a.row_pk->>'id' = i.id::text
        AND a.diff ? 'quarterly_data'
      ORDER BY a.changed_at DESC
      LIMIT 1
    ) AS old_qd
  FROM public.initiatives i
  WHERE i.deleted_at IS NOT NULL
)
SELECT
  unit,
  team,
  initiative,
  deleted_at::date AS deleted_on,
  (
    COALESCE((old_qd #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((old_qd #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((old_qd #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((old_qd #>> '{2026-Q4,cost}')::numeric, 0)
  )::bigint AS lost_year_cost,
  (COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0))::bigint AS cost_left_on_row
FROM deleted d
JOIN public.initiatives i ON i.id = d.id
WHERE (
  COALESCE((old_qd #>> '{2026-Q1,cost}')::numeric, 0)
  + COALESCE((old_qd #>> '{2026-Q2,cost}')::numeric, 0)
  + COALESCE((old_qd #>> '{2026-Q3,cost}')::numeric, 0)
  + COALESCE((old_qd #>> '{2026-Q4,cost}')::numeric, 0)
) > 1000
ORDER BY lost_year_cost DESC;
