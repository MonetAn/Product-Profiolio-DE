-- Почему sum(quarterly 2026) <> LIST1 2111435636 и PnL <> 2038870010
-- Только SELECT. Один Run целиком.

SELECT
  2111435636::bigint AS list1_all,
  2038870010::bigint AS list1_pnl_it,
  (SELECT truth_total_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_all,
  (SELECT truth_pnl_it_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_pnl,
  (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS sum_baseline_all,
  (SELECT round(sum(rub_pnl_it))::bigint FROM public.team_budget_baseline_2026) AS sum_baseline_pnl;

SELECT round(sum(
  COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
))::bigint AS sum_quarterly_cost,
  2111435636 - round(sum(
  COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
))::bigint AS gap_vs_list1
FROM public.initiatives
WHERE deleted_at IS NULL;

-- Codo (~536k) — типичная дыра между live и LIST1
SELECT
  b.unit,
  b.team,
  b.rub_all AS baseline_year,
  coalesce(t.live_year, 0)::bigint AS live_year,
  (b.rub_all - coalesce(t.live_year, 0))::bigint AS gap
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
WHERE b.team = 'Codo' OR abs(b.rub_all - coalesce(t.live_year, 0)) > 10000
ORDER BY abs(b.rub_all - coalesce(t.live_year, 0)) DESC
LIMIT 15;
