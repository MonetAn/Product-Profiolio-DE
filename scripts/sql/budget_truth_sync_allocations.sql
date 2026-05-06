-- =============================================================================
-- Заполнить public.initiative_budget_department_2026 из public._budget_truth_csv
-- (колонка budget_department = строка «Департамент» из CSV как есть).
--
-- Условие: по trim(initiative) среди не-stub initiatives ровно ОДНА строка в БД.
-- Иначе инициатива пропускается (см. выборку внизу «skipped_ambiguous» / «skipped_missing»).
--
-- Порядок:
--   1) node scripts/reconcile-budget-csv.mjs "<файл.csv>"
--   2) выполнить *-truth-insert.sql
--   3) миграция с таблицей initiative_budget_department_2026 (если ещё нет)
--   4) этот файл — в транзакции: begin; … commit;
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION 'Нет public._budget_truth_csv';
  END IF;
  IF to_regclass('public.initiative_budget_department_2026') IS NULL THEN
    RAISE EXCEPTION
      'Нет public.initiative_budget_department_2026 — примените миграцию supabase/migrations/20260504180000_initiative_budget_department_2026.sql';
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

-- Отчёт: кому не проставили (нужны правила вручную или правка имён в БД/CSV)
WITH
ini_once AS (
  SELECT trim(initiative) AS iname, (array_agg(id ORDER BY id))[1] AS initiative_id
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) = 1
),
amb AS (
  SELECT trim(initiative) AS iname
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) > 1
),
missing AS (
  SELECT DISTINCT trim(t.initiative) AS iname
  FROM public._budget_truth_csv t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.initiatives i
    WHERE COALESCE(i.is_timeline_stub, false) = false
      AND trim(i.initiative) = trim(t.initiative)
  )
)
SELECT 'ambiguous_name_in_db'::text AS reason, a.iname::text AS initiative
FROM amb a
WHERE a.iname IN (SELECT DISTINCT trim(initiative) FROM public._budget_truth_csv)
UNION ALL
SELECT 'no_initiative_row_in_db'::text, m.iname::text
FROM missing m
ORDER BY 1, 2;
