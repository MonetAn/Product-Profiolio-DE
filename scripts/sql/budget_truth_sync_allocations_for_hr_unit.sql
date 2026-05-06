-- =============================================================================
-- Заполнить initiative_budget_department_2026 из _budget_truth_csv только для
-- инициатив с заданным HR-unit (колонка initiatives.unit).
--
-- В CSV колонки unit/team из парсинга «Департамент» часто дают IT / B2B.* —
-- это не HR-пара в продукте. Отбор по trim(initiatives.unit) = «B2B Pizza».
--
-- Условие как в budget_truth_sync_allocations.sql: одно не-stub совпадение по
-- trim(initiative) в БД (ini_once).
--
-- Порядок:
--   1) node scripts/reconcile-budget-csv.mjs "<ваш.csv>"
--   2) выполнить scripts/out/*-truth-insert.sql (таблица _budget_truth_csv)
--   3) этот файл (begin/commit уже есть)
--   4) scripts/sql/budget_truth_sync_quarterly_from_allocations.sql
--
-- Другой юнит: замените literal 'B2B Pizza' ниже (одно место).
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION 'Нет public._budget_truth_csv — выполните *-truth-insert.sql';
  END IF;
  IF to_regclass('public.initiative_budget_department_2026') IS NULL THEN
    RAISE EXCEPTION 'Нет public.initiative_budget_department_2026';
  END IF;
END
$guard$;

ALTER TABLE public._budget_truth_csv
  ADD COLUMN IF NOT EXISTS is_in_pnl_it boolean NOT NULL DEFAULT true;

BEGIN;

WITH
ini_once AS (
  SELECT trim(initiative) AS iname, (array_agg(id ORDER BY id))[1] AS initiative_id
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) = 1
),
to_insert AS (
  SELECT
    i.initiative_id,
    t.budget_department,
    t.q1::numeric,
    t.q2::numeric,
    t.q3::numeric,
    t.q4::numeric,
    COALESCE(t.is_in_pnl_it, true) AS is_in_pnl_it
  FROM public._budget_truth_csv t
  INNER JOIN ini_once i ON i.iname = trim(t.initiative)
  INNER JOIN public.initiatives hr
    ON hr.id = i.initiative_id
    AND COALESCE(hr.is_timeline_stub, false) = false
    AND trim(hr.unit) = 'B2B Pizza'
),
del AS (
  DELETE FROM public.initiative_budget_department_2026 a
  WHERE a.initiative_id IN (SELECT DISTINCT initiative_id FROM to_insert)
  RETURNING a.initiative_id
)
INSERT INTO public.initiative_budget_department_2026 (
  initiative_id,
  budget_department,
  q1,
  q2,
  q3,
  q4,
  is_in_pnl_it,
  updated_at
)
SELECT
  initiative_id,
  budget_department,
  q1,
  q2,
  q3,
  q4,
  is_in_pnl_it,
  timezone('utc'::text, now())
FROM to_insert;

COMMIT;

-- Строки CSV с именами из B2B Pizza, но имя неоднозначно глобально — не попали в to_insert
WITH
ini_once AS (
  SELECT trim(initiative) AS iname, (array_agg(id ORDER BY id))[1] AS initiative_id
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) = 1
),
csv_names AS (
  SELECT DISTINCT trim(t.initiative) AS iname
  FROM public._budget_truth_csv t
  WHERE EXISTS (
    SELECT 1 FROM public.initiatives i
    WHERE trim(i.initiative) = trim(t.initiative)
      AND COALESCE(i.is_timeline_stub, false) = false
      AND trim(i.unit) = 'B2B Pizza'
  )
),
amb AS (
  SELECT trim(initiative) AS iname
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) > 1
)
SELECT 'ambiguous_name_in_db'::text AS reason, a.iname::text AS initiative
FROM amb a
WHERE a.iname IN (SELECT iname FROM csv_names)
UNION ALL
SELECT 'no_unique_match_for_b2b_pizza_csv'::text, c.iname::text
FROM csv_names c
WHERE c.iname NOT IN (SELECT iname FROM ini_once)
ORDER BY 1, 2;
