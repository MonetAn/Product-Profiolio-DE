-- Подтянуть sum(split PnL) к anchor_pnl_it (~2038M). Только is_in_pnl_it.
-- quarterly_data не трогаем. Перед прогоном: budget_2026_backup_split_pre_pnl_scale.sql
-- Проба: замените COMMIT на ROLLBACK в конце.

BEGIN;

CREATE TEMP TABLE _pnl_scale_factor ON COMMIT DROP AS
SELECT a.target / NULLIF(c.s, 0) AS factor
FROM (
  SELECT truth_pnl_it_rub::numeric AS target
  FROM public.budget_portfolio_anchor_2026
  WHERE id = 1
) a,
(
  SELECT sum(b.q1 + b.q2 + b.q3 + b.q4)::numeric AS s
  FROM public.initiative_budget_department_2026 b
  JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
  WHERE b.is_in_pnl_it
) c;

UPDATE public.initiative_budget_department_2026 b
SET
  q1 = round(b.q1 * f.factor),
  q2 = round(b.q2 * f.factor),
  q3 = round(b.q3 * f.factor),
  q4 = round(b.q4 * f.factor),
  updated_at = timezone('utc'::text, now())
FROM _pnl_scale_factor f
WHERE b.is_in_pnl_it;

-- Копейки: добить остаток до anchor на строке с max PnL годом
WITH
anchor AS (
  SELECT truth_pnl_it_rub::bigint AS target
  FROM public.budget_portfolio_anchor_2026
  WHERE id = 1
),
cur AS (
  SELECT sum(b.q1 + b.q2 + b.q3 + b.q4)::bigint AS s
  FROM public.initiative_budget_department_2026 b
  JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
  WHERE b.is_in_pnl_it
),
delta AS (
  SELECT (a.target - c.s)::bigint AS rub
  FROM anchor a, cur c
),
top_row AS (
  SELECT b.initiative_id, b.budget_department
  FROM public.initiative_budget_department_2026 b
  JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
  WHERE b.is_in_pnl_it
  ORDER BY (b.q1 + b.q2 + b.q3 + b.q4) DESC, b.initiative_id
  LIMIT 1
)
UPDATE public.initiative_budget_department_2026 b
SET q4 = b.q4 + d.rub, updated_at = timezone('utc'::text, now())
FROM delta d, top_row t
WHERE b.initiative_id = t.initiative_id
  AND b.budget_department = t.budget_department
  AND d.rub <> 0;

SELECT
  (SELECT truth_pnl_it_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_pnl,
  (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
   FROM public.initiative_budget_department_2026 b
   JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
   WHERE b.is_in_pnl_it) AS sum_split_pnl_after,
  (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
   FROM public.initiative_budget_department_2026 b
   JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL) AS sum_split_all_after,
  (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
   FROM public.initiative_budget_department_2026 b
   JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
   WHERE NOT b.is_in_pnl_it) AS sum_split_non_pnl_after,
  (SELECT round(factor, 8) FROM _pnl_scale_factor) AS factor_applied,
  (SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint FROM public.initiatives WHERE deleted_at IS NULL) AS sum_quarterly_unchanged;

COMMIT;
