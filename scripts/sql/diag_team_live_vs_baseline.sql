-- Сверка live vs baseline для одной команды (только SELECT).
-- Подставьте unit и team из админки (регистр и символы важны: HR&Staff ≠ HR BP).

-- ── 0) Найти похожие имена, если не уверены ────────────────────────────────
SELECT b.unit, b.team, b.rub_all::bigint
FROM public.team_budget_baseline_2026 b
WHERE b.team ILIKE '%HR%' OR b.team ILIKE '%BP%' OR b.unit ILIKE '%HR%'
ORDER BY b.unit, b.team;

-- ── 1) Сводка: замените unit / team ─────────────────────────────────────────
-- Пример: 'B2B Pizza', 'HR&Staff'  или  'IT HR', 'IT HR'
WITH params AS (
  SELECT 'B2B Pizza'::text AS unit, 'HR&Staff'::text AS team
),
live AS (
  SELECT
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live_year,
    count(*) FILTER (WHERE NOT COALESCE(i.is_timeline_stub, false)) AS initiatives,
    count(*) FILTER (WHERE COALESCE(i.is_timeline_stub, false)) AS stubs
  FROM public.initiatives i
  CROSS JOIN params p
  WHERE i.deleted_at IS NULL AND i.unit = p.unit AND i.team = p.team
)
SELECT
  p.unit,
  p.team,
  b.rub_all::bigint AS baseline_year,
  l.live_year,
  (l.live_year - b.rub_all::bigint) AS gap_year,
  l.initiatives,
  l.stubs,
  CASE
    WHEN l.live_year IS NULL THEN 'нет инициатив в БД'
    WHEN l.live_year = b.rub_all::bigint THEN 'OK: delete (старый код) не сдвинет'
    WHEN l.live_year < b.rub_all::bigint THEN 'БАГ: delete ПОДНИМЕТ на ' || (b.rub_all::bigint - l.live_year)::text
    ELSE 'БАГ: delete ОПУСТИТ на ' || (l.live_year - b.rub_all::bigint)::text
  END AS old_delete_behavior
FROM params p
LEFT JOIN public.team_budget_baseline_2026 b ON b.unit = p.unit AND b.team = p.team
CROSS JOIN live l;
