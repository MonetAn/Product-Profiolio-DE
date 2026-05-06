-- =============================================================================
-- Полная перезапись бюджета 2026 под CSV (источник истины: public._budget_truth_csv).
--
-- Делает:
--   1) TRUNCATE public.initiative_budget_department_2026 — старые разбивки удаляются.
--   2) INSERT из _budget_truth_csv только для инициатив с однозначным именем в БД
--      (ровно одна не-stub строка с таким trim(initiative)).
--   3) initiatives.quarterly_data: для этих id — cost 2026-Q1…Q4 = сумма q1…q4 по разбивке,
--      otherCosts = 0, costFinanceConfirmed = true.
--   4) Все остальные не-stub инициативы: обнулить cost 2026-Q1…Q4 (в CSV их нет / не смогли сматчить).
--   5) Убрать ключи 2025-Q* из quarterly_data у не-stub (как в safe import).
--
-- Перед запуском (два шага):
--   A) node scripts/reconcile-budget-csv.mjs "/path/to/Данные.csv"
--   B) в SQL Editor выполнить сгенерированный scripts/out/*-truth-insert.sql
--   C) этот файл целиком (одна транзакция).
--
-- Нужны колонки created_at/updated_at на initiative_budget_department_2026 (миграция
-- 20260504180000 или 20260506130000_add_timestamps).
--
-- Ограничение: если в БД несколько строк с одним названием инициативы — CSV для неё
-- не применится; смотрите финальный SELECT (ambiguous_name_in_db).
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION
      'Нет public._budget_truth_csv. Сначала: node scripts/reconcile-budget-csv.mjs «файл.csv», затем выполните scripts/out/*-truth-insert.sql';
  END IF;
  IF to_regclass('public.initiative_budget_department_2026') IS NULL THEN
    RAISE EXCEPTION
      'Нет public.initiative_budget_department_2026 — миграция 20260504180000_initiative_budget_department_2026.sql';
  END IF;
END
$guard$;

-- Старая ручная таблица могла называть колонку department вместо budget_department.
DO $col$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_budget_truth_csv'
      AND column_name = 'department'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_budget_truth_csv'
      AND column_name = 'budget_department'
  ) THEN
    ALTER TABLE public._budget_truth_csv RENAME COLUMN department TO budget_department;
  END IF;
END
$col$;

-- Колонка из свежего reconcile (PnL IT по строке CSV); старые truth-файлы без неё.
DO $pnl$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NOT NULL THEN
    ALTER TABLE public._budget_truth_csv
      ADD COLUMN IF NOT EXISTS is_in_pnl_it boolean NOT NULL DEFAULT true;
  END IF;
END
$pnl$;

BEGIN;

-- Однозначные инициативы по имени (как в budget_truth_sync_allocations.sql)
CREATE TEMP TABLE _ini_once ON COMMIT DROP AS
SELECT
  trim(initiative) AS iname,
  (array_agg(id ORDER BY id))[1] AS initiative_id
FROM public.initiatives
WHERE COALESCE(is_timeline_stub, false) = false
GROUP BY trim(initiative)
HAVING count(*) = 1;

-- Полная очистка разбивки; дальше только то, что есть в CSV и сматчилось.
TRUNCATE public.initiative_budget_department_2026;

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
  i.initiative_id,
  t.budget_department,
  t.q1::numeric,
  t.q2::numeric,
  t.q3::numeric,
  t.q4::numeric,
  t.is_in_pnl_it,
  timezone('utc'::text, now())
FROM public._budget_truth_csv t
INNER JOIN _ini_once i ON i.iname = trim(t.initiative);

-- Синхронизация quarterly_data под суммы разбивки (только id, которые есть в таблице после вставки)
WITH agg AS (
  SELECT
    initiative_id,
    GREATEST(0, round(sum(q1)))::numeric AS s1,
    GREATEST(0, round(sum(q2)))::numeric AS s2,
    GREATEST(0, round(sum(q3)))::numeric AS s3,
    GREATEST(0, round(sum(q4)))::numeric AS s4
  FROM public.initiative_budget_department_2026
  GROUP BY initiative_id
)
UPDATE public.initiatives i
SET
  quarterly_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            COALESCE(i.quarterly_data, '{}'::jsonb),
                            ARRAY['2026-Q1','cost'],
                            to_jsonb(a.s1),
                            true
                          ),
                          ARRAY['2026-Q1','otherCosts'],
                          '0'::jsonb,
                          true
                        ),
                        ARRAY['2026-Q1','costFinanceConfirmed'],
                        'true'::jsonb,
                        true
                      ),
                      ARRAY['2026-Q2','cost'],
                      to_jsonb(a.s2),
                      true
                    ),
                    ARRAY['2026-Q2','otherCosts'],
                    '0'::jsonb,
                    true
                  ),
                  ARRAY['2026-Q2','costFinanceConfirmed'],
                  'true'::jsonb,
                  true
                ),
                ARRAY['2026-Q3','cost'],
                to_jsonb(a.s3),
                true
              ),
              ARRAY['2026-Q3','otherCosts'],
              '0'::jsonb,
              true
            ),
            ARRAY['2026-Q3','costFinanceConfirmed'],
            'true'::jsonb,
            true
          ),
          ARRAY['2026-Q4','cost'],
          to_jsonb(a.s4),
          true
        ),
        ARRAY['2026-Q4','otherCosts'],
        '0'::jsonb,
        true
      ),
      ARRAY['2026-Q4','costFinanceConfirmed'],
      'true'::jsonb,
      true
    ),
  updated_at = timezone('utc'::text, now())
FROM agg a
WHERE i.id = a.initiative_id
  AND COALESCE(i.is_timeline_stub, false) = false;

-- Не-stub без строк в разбивке (нет в CSV / дубликат имени / и т.д.): обнулить 2026
UPDATE public.initiatives i
SET
  quarterly_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(i.quarterly_data, '{}'::jsonb),
                    ARRAY['2026-Q1','cost'],
                    to_jsonb(0::numeric),
                    true
                  ),
                  ARRAY['2026-Q1','otherCosts'],
                  '0'::jsonb,
                  true
                ),
                ARRAY['2026-Q2','cost'],
                to_jsonb(0::numeric),
                true
              ),
              ARRAY['2026-Q2','otherCosts'],
              '0'::jsonb,
              true
            ),
            ARRAY['2026-Q3','cost'],
            to_jsonb(0::numeric),
            true
          ),
          ARRAY['2026-Q3','otherCosts'],
          '0'::jsonb,
          true
        ),
        ARRAY['2026-Q4','cost'],
        to_jsonb(0::numeric),
        true
      ),
      ARRAY['2026-Q4','otherCosts'],
      '0'::jsonb,
      true
    ),
  updated_at = timezone('utc'::text, now())
WHERE COALESCE(i.is_timeline_stub, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.initiative_budget_department_2026 b WHERE b.initiative_id = i.id
  );

-- Убрать 2025 из quarterly_data у не-stub
UPDATE public.initiatives
SET
  quarterly_data =
    (COALESCE(quarterly_data, '{}'::jsonb) - '2025-Q1' - '2025-Q2' - '2025-Q3' - '2025-Q4'),
  updated_at = timezone('utc'::text, now())
WHERE COALESCE(is_timeline_stub, false) = false;

COMMIT;

-- Отчёт: что не попало в перезапись (имена из CSV без однозначной строки в БД)
WITH
ini_once AS (
  SELECT trim(initiative) AS iname
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
