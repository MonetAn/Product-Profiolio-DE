-- =============================================================================
-- Применить суммы из public._budget_truth_csv к initiatives.quarterly_data
-- (ключи 2026-Q1 … 2026-Q4), без JSON-экспорта и без node --db-json.
--
-- Логика как в scripts/reconcile-budget-csv.mjs:
--   new_cost = max(0, round(truth_total − COALESCE(otherCosts, 0)))
--   costFinanceConfirmed = true для каждого квартала в обновлении
-- Обновляются только строки, где |truth − (cost+otherCosts)| > 1 хотя бы в одном квартале.
--
-- ПОРЯДОК:
--   1) node scripts/reconcile-budget-csv.mjs "<ваш.csv>"   → выполнить *-truth-insert.sql в Supabase
--   2) (опционально) scripts/sql/budget_truth_reconcile.sql — посмотреть расхождения
--   3) Этот файл — PREVIEW (счётчик строк). Затем scripts/sql/budget_truth_apply_updates_run.sql в транзакции
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION
      'Нет таблицы public._budget_truth_csv. Сначала выполните scripts/out/*-truth-insert.sql';
  END IF;
END
$guard$;

DO $dup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.initiatives
    WHERE COALESCE(is_timeline_stub, false) = false
    GROUP BY initiative, unit, team
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'В initiatives есть дубликаты (initiative, unit, team) среди не-stub строк. Исправьте вручную до массового UPDATE';
  END IF;
END
$dup$;

-- ---------------------------------------------------------------------------
-- PREVIEW: сколько строк затронет UPDATE (должно совпасть с числом UPDATE в reconcile при совпадении ключей)
-- ---------------------------------------------------------------------------
WITH db AS (
  SELECT
    trim(initiative) AS initiative,
    trim(unit) AS unit,
    trim(team) AS team,
    id,
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
SELECT count(*) AS rows_to_update
FROM public._budget_truth_csv t
INNER JOIN db d
  ON d.initiative = t.initiative
 AND d.unit = t.unit
 AND d.team = t.team
WHERE
     abs(t.q1 - d.db_q1) > 1
  OR abs(t.q2 - d.db_q2) > 1
  OR abs(t.q3 - d.db_q3) > 1
  OR abs(t.q4 - d.db_q4) > 1;

-- Следующий шаг: scripts/sql/budget_truth_apply_updates_run.sql (желательно внутри begin; … commit;).
