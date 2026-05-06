-- =============================================================================
-- Сверка CSV «истины» с таблицей initiatives (только строки с расхождениями).
--
-- ОБЯЗАТЕЛЬНЫЙ ПОРЯДОК (иначе будет relation "_budget_truth_csv" does not exist):
--
--   1) В терминале из корня репозитория:
--        node scripts/reconcile-budget-csv.mjs "/полный/путь/к/вашему.csv"
--
--   2) Откройте сгенерированный файл (он большой, ~1100+ строк):
--        scripts/out/<имя-вашего-csv>-truth-insert.sql
--      Скопируйте ВЕСЬ файл в Supabase SQL Editor и выполните ОДИН раз.
--      Таблица _budget_truth_csv: PK (initiative, budget_department), плюс unit/team из парсинга.
--
--   3) Выполните запрос ниже (от DO до конца SELECT).
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION
      'Таблица public._budget_truth_csv не найдена. Шаг 2: выполните целиком файл scripts/out/*-truth-insert.sql после команды node scripts/reconcile-budget-csv.mjs';
  END IF;
END
$guard$;

WITH db AS (
  SELECT
    trim(initiative) AS initiative,
    trim(unit) AS unit,
    trim(team) AS team,
    id,
    -- Должно совпадать с ключами в initiatives.quarterly_data (сейчас в продукте — 2026-Q*).
    COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
      + COALESCE((quarterly_data->'2026-Q1'->>'otherCosts')::numeric, 0) AS db_q1,
    COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
      + COALESCE((quarterly_data->'2026-Q2'->>'otherCosts')::numeric, 0) AS db_q2,
    COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
      + COALESCE((quarterly_data->'2026-Q3'->>'otherCosts')::numeric, 0) AS db_q3,
    COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
      + COALESCE((quarterly_data->'2026-Q4'->>'otherCosts')::numeric, 0) AS db_q4
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
)
SELECT
  COALESCE(t.initiative, d.initiative) AS initiative,
  COALESCE(t.unit, d.unit) AS unit,
  COALESCE(t.team, d.team) AS team,
  t.q1 AS truth_q1,
  d.db_q1,
  t.q1 - COALESCE(d.db_q1, 0) AS diff_q1,
  t.q2 AS truth_q2,
  d.db_q2,
  t.q2 - COALESCE(d.db_q2, 0) AS diff_q2,
  t.q3 AS truth_q3,
  d.db_q3,
  t.q3 - COALESCE(d.db_q3, 0) AS diff_q3,
  t.q4 AS truth_q4,
  d.db_q4,
  t.q4 - COALESCE(d.db_q4, 0) AS diff_q4,
  d.id
FROM public._budget_truth_csv t
FULL OUTER JOIN db d
  ON d.initiative = t.initiative
 AND d.unit = t.unit
 AND d.team = t.team
WHERE
  t.initiative IS NULL
  OR d.initiative IS NULL
  OR ABS(t.q1 - COALESCE(d.db_q1, 0)) > 1
  OR ABS(t.q2 - COALESCE(d.db_q2, 0)) > 1
  OR ABS(t.q3 - COALESCE(d.db_q3, 0)) > 1
  OR ABS(t.q4 - COALESCE(d.db_q4, 0)) > 1
ORDER BY initiative, unit, team;

-- После сверки / правок (опционально):
-- DROP TABLE IF EXISTS public._budget_truth_csv;
