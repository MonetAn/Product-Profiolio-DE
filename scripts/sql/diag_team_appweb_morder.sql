-- Диагностика команды App&Web / mOrder
-- Только SELECT. Запустить целиком в Supabase SQL Editor и прислать все результаты.
-- Эталон LIST1: team_budget_baseline_2026; live = sum(initiatives.quarterly_data cost 2026)

-- ── 0) Проверка имени команды (если пусто — уточнить написание) ─────────────
SELECT team, rub_all
FROM public.team_budget_baseline_2026
WHERE unit = 'App&Web' AND team ILIKE '%morder%'
ORDER BY team;

-- ── 1) Сводка: baseline vs live (год и по кварталам) ───────────────────────
WITH live_q AS (
  SELECT
    i.unit,
    i.team,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)))::bigint AS live_q1,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)))::bigint AS live_q2,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)))::bigint AS live_q3,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)))::bigint AS live_q4,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live_year,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,otherCosts}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,otherCosts}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,otherCosts}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,otherCosts}')::numeric, 0)
    ))::bigint AS live_other_costs_year,
    count(*) FILTER (WHERE NOT COALESCE(i.is_timeline_stub, false)) AS initiative_rows,
    count(*) FILTER (WHERE COALESCE(i.is_timeline_stub, false)) AS stub_rows
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
    AND i.unit = 'App&Web'
    AND i.team = 'mOrder'
  GROUP BY i.unit, i.team
)
SELECT
  b.unit,
  b.team,
  b.q1::bigint AS baseline_q1,
  l.live_q1,
  (l.live_q1 - b.q1::bigint) AS gap_q1,
  b.q2::bigint AS baseline_q2,
  l.live_q2,
  (l.live_q2 - b.q2::bigint) AS gap_q2,
  b.q3::bigint AS baseline_q3,
  l.live_q3,
  (l.live_q3 - b.q3::bigint) AS gap_q3,
  b.q4::bigint AS baseline_q4,
  l.live_q4,
  (l.live_q4 - b.q4::bigint) AS gap_q4,
  b.rub_all::bigint AS baseline_year,
  l.live_year,
  (l.live_year - b.rub_all::bigint) AS gap_year,
  l.live_other_costs_year,
  b.rub_pnl_it::bigint AS baseline_pnl_it,
  l.initiative_rows,
  l.stub_rows,
  -- При delete в админке код тянет к baseline, не к live:
  CASE
    WHEN l.live_year = b.rub_all::bigint THEN 'совпадает'
    WHEN l.live_year < b.rub_all::bigint THEN 'delete поднимет тотал к baseline'
    ELSE 'delete опустит тотал к baseline'
  END AS delete_effect_hint
FROM public.team_budget_baseline_2026 b
LEFT JOIN live_q l ON l.unit = b.unit AND l.team = b.team
WHERE b.unit = 'App&Web' AND b.team = 'mOrder';

-- ── 2) Σ% усилий по кварталам (>100% = риск раздувания при Quick Flow) ─────
SELECT
  '2026-Q1' AS quarter,
  round(sum(COALESCE((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0))::numeric, 2) AS sum_effort_pct,
  count(*) FILTER (WHERE NOT COALESCE(is_timeline_stub, false)) AS non_stub_rows
FROM public.initiatives
WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder'
UNION ALL
SELECT '2026-Q2', round(sum(COALESCE((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0))::numeric, 2),
  count(*) FILTER (WHERE NOT COALESCE(is_timeline_stub, false))
FROM public.initiatives WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder'
UNION ALL
SELECT '2026-Q3', round(sum(COALESCE((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0))::numeric, 2),
  count(*) FILTER (WHERE NOT COALESCE(is_timeline_stub, false))
FROM public.initiatives WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder'
UNION ALL
SELECT '2026-Q4', round(sum(COALESCE((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0))::numeric, 2),
  count(*) FILTER (WHERE NOT COALESCE(is_timeline_stub, false))
FROM public.initiatives WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder'
ORDER BY quarter;

-- ── 3) Дубли заглушек ───────────────────────────────────────────────────────
SELECT id, initiative, is_timeline_stub,
  round((
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint AS year_cost
FROM public.initiatives
WHERE deleted_at IS NULL
  AND unit = 'App&Web'
  AND team = 'mOrder'
  AND COALESCE(is_timeline_stub, false) = true
ORDER BY year_cost DESC;

-- ── 4) Топ инициатив по годовому cost (не заглушки) ───────────────────────
SELECT
  id,
  left(initiative, 60) AS initiative,
  round(COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0))::bigint AS q1_cost,
  round(COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0))::bigint AS q2_cost,
  round(COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0))::bigint AS q3_cost,
  round(COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0))::bigint AS q4_cost,
  round(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  )::bigint AS year_cost,
  round(COALESCE((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0))::int AS q1_eff,
  round(COALESCE((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0))::int AS q2_eff,
  round(COALESCE((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0))::int AS q3_eff,
  round(COALESCE((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0))::int AS q4_eff
FROM public.initiatives
WHERE deleted_at IS NULL
  AND unit = 'App&Web'
  AND team = 'mOrder'
  AND NOT COALESCE(is_timeline_stub, false)
ORDER BY year_cost DESC
LIMIT 25;

-- ── 5) Заглушка: cost и остаток % (100 − Σeff non-stub) по кварталам ─────
WITH stub AS (
  SELECT id, initiative, quarterly_data
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder' AND COALESCE(is_timeline_stub, false)
  LIMIT 1
),
eff AS (
  SELECT
    round(sum(COALESCE((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0)))::numeric AS eff_q1,
    round(sum(COALESCE((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0)))::numeric AS eff_q2,
    round(sum(COALESCE((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0)))::numeric AS eff_q3,
    round(sum(COALESCE((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0)))::numeric AS eff_q4
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder' AND NOT COALESCE(is_timeline_stub, false)
)
SELECT
  s.id AS stub_id,
  left(s.initiative, 50) AS stub_name,
  round(COALESCE((s.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0))::bigint AS stub_q1_cost,
  round(COALESCE((s.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0))::bigint AS stub_q2_cost,
  round(COALESCE((s.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0))::bigint AS stub_q3_cost,
  round(COALESCE((s.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0))::bigint AS stub_q4_cost,
  e.eff_q1 AS sum_non_stub_eff_q1,
  (100 - e.eff_q1) AS stub_eff_implied_q1,
  e.eff_q2 AS sum_non_stub_eff_q2,
  (100 - e.eff_q2) AS stub_eff_implied_q2,
  e.eff_q3 AS sum_non_stub_eff_q3,
  e.eff_q4 AS sum_non_stub_eff_q4
FROM stub s
CROSS JOIN eff e;

-- ── 6) Вклад команды в портфель (как на дашборде «Только PnL IT») ─────────
-- PnL-множитель = rub_pnl_it / rub_all (для mOrder обычно 1.0)
SELECT
  l.live_year,
  b.rub_all::bigint AS baseline_year,
  b.rub_pnl_it::bigint AS baseline_pnl,
  CASE WHEN b.rub_all > 0 THEN round(b.rub_pnl_it / b.rub_all, 6) ELSE 0 END AS pnl_share,
  round(l.live_year * CASE WHEN b.rub_all > 0 THEN b.rub_pnl_it / b.rub_all ELSE 0 END)::bigint AS dashboard_pnl_contribution
FROM (
  SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint AS live_year
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'App&Web' AND team = 'mOrder'
) l
CROSS JOIN public.team_budget_baseline_2026 b
WHERE b.unit = 'App&Web' AND b.team = 'mOrder';
