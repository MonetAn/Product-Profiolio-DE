-- Краткая диагностика после заливки public._budget_truth_csv (*-truth-insert.sql).
-- Один результат — три счётчика.

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION 'Нет public._budget_truth_csv — выполните *-truth-insert.sql';
  END IF;
END
$guard$;

WITH
db AS (
  SELECT
    trim(initiative) AS initiative,
    trim(unit) AS unit,
    trim(team) AS team,
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
),
c1 AS (
  SELECT count(*)::bigint AS csv_rows_without_hr_match
  FROM public._budget_truth_csv t
  WHERE NOT EXISTS (
    SELECT 1 FROM db d
    WHERE d.initiative = trim(t.initiative)
      AND d.unit = trim(t.unit)
      AND d.team = trim(t.team)
  )
),
amb AS (
  SELECT trim(initiative) AS iname
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
  GROUP BY trim(initiative)
  HAVING count(*) > 1
),
c2 AS (
  SELECT count(*)::bigint AS csv_rows_for_ambiguous_names
  FROM public._budget_truth_csv t
  WHERE trim(t.initiative) IN (SELECT iname FROM amb)
),
c3 AS (
  SELECT count(*)::bigint AS hr_matched_value_mismatch
  FROM public._budget_truth_csv t
  INNER JOIN db d
    ON d.initiative = trim(t.initiative)
   AND d.unit = trim(t.unit)
   AND d.team = trim(t.team)
  WHERE
       abs(t.q1 - d.db_q1) > 1
    OR abs(t.q2 - d.db_q2) > 1
    OR abs(t.q3 - d.db_q3) > 1
    OR abs(t.q4 - d.db_q4) > 1
)
SELECT
  c1.csv_rows_without_hr_match,
  c2.csv_rows_for_ambiguous_names,
  c3.hr_matched_value_mismatch
FROM c1, c2, c3;
