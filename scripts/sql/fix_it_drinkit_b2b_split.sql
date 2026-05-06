-- Распределяем бюджет инициативы IT Drinkit.B2B (18 889 465) между Barista
-- Experience и ERP Manufacture в долях по их текущему бюджету
-- (Barista 10 149 776 ≈ 29.31%  /  ERP 24 477 383 ≈ 70.69%).
-- Удаляем обе строки IT Drinkit.B2B (источник в IT Drinkit/B2B и пустую дубль-строку).
--
-- Применение (preview, ничего не запишет):
--   scripts/db-psql.sh -f scripts/sql/fix_it_drinkit_b2b_split.sql
-- Применение (запись):
--   замени "ROLLBACK;" на "COMMIT;" и запусти ещё раз.
--
-- Идемпотентность: после COMMIT повторный запуск не найдёт источник и поднимет
-- ошибку «delta is empty» — это защитный sanity-check.

\set ON_ERROR_STOP on

\echo ''
\echo '── BEFORE ──────────────────────────────────────────────────────────'
SELECT i.unit, i.team, i.initiative,
       coalesce(b.budget_department,'—') AS budget_dept,
       coalesce(b.q1,0) AS q1, coalesce(b.q2,0) AS q2,
       coalesce(b.q3,0) AS q3, coalesce(b.q4,0) AS q4,
       coalesce(b.q1+b.q2+b.q3+b.q4,0) AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id = i.id
WHERE i.unit IN ('IT Drinkit')
   OR (i.unit='Drinkit' AND i.team IN ('B2B IT Team'))
ORDER BY i.unit, i.team, i.initiative, budget_dept;

BEGIN;

-- Шаг 0: фиксируем дельту в TEMP TABLE ДО любых UPDATE'ов.
-- Иначе второй UPDATE увидел бы уже обновлённую базу и пропорция исказилась бы.
CREATE TEMP TABLE _tmp_split ON COMMIT DROP AS
WITH src AS (
  SELECT q1, q2, q3, q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id = '7de8d329-803f-4c3d-851e-bbad4796219d'
    AND budget_department = 'IT Drinkit.B2B'
),
base AS (
  SELECT
    (SELECT (q1+q2+q3+q4) FROM public.initiative_budget_department_2026
      WHERE initiative_id = '9d8eb058-2a80-48e1-a2a9-f748e01fb353'
        AND budget_department = 'IT Drinkit.Tech') AS barista_total,
    (SELECT (q1+q2+q3+q4) FROM public.initiative_budget_department_2026
      WHERE initiative_id = '3bd58d96-a7ae-4bdf-8767-602711cd02d3'
        AND budget_department = 'IT Drinkit.Tech') AS erp_total
)
SELECT
  src.q1 * base.barista_total / (base.barista_total + base.erp_total) AS barista_q1,
  src.q2 * base.barista_total / (base.barista_total + base.erp_total) AS barista_q2,
  src.q3 * base.barista_total / (base.barista_total + base.erp_total) AS barista_q3,
  src.q4 * base.barista_total / (base.barista_total + base.erp_total) AS barista_q4,
  src.q1 * base.erp_total     / (base.barista_total + base.erp_total) AS erp_q1,
  src.q2 * base.erp_total     / (base.barista_total + base.erp_total) AS erp_q2,
  src.q3 * base.erp_total     / (base.barista_total + base.erp_total) AS erp_q3,
  src.q4 * base.erp_total     / (base.barista_total + base.erp_total) AS erp_q4
FROM src, base;

-- Sanity: убеждаемся, что дельта вообще нашлась (защита от повторного запуска)
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM _tmp_split;
  IF n = 0 THEN
    RAISE EXCEPTION 'IT Drinkit.B2B источник не найден — скорее всего скрипт уже применён';
  END IF;
END $$;

\echo ''
\echo '── DELTA (что будет прибавлено к каждой строке) ────────────────────'
SELECT * FROM _tmp_split;

-- Шаг 1: прибавляем Barista-долю
UPDATE public.initiative_budget_department_2026 AS b
SET q1 = b.q1 + t.barista_q1,
    q2 = b.q2 + t.barista_q2,
    q3 = b.q3 + t.barista_q3,
    q4 = b.q4 + t.barista_q4,
    updated_at = now()
FROM _tmp_split t
WHERE b.initiative_id = '9d8eb058-2a80-48e1-a2a9-f748e01fb353'
  AND b.budget_department = 'IT Drinkit.Tech';

-- Шаг 2: прибавляем ERP-долю
UPDATE public.initiative_budget_department_2026 AS b
SET q1 = b.q1 + t.erp_q1,
    q2 = b.q2 + t.erp_q2,
    q3 = b.q3 + t.erp_q3,
    q4 = b.q4 + t.erp_q4,
    updated_at = now()
FROM _tmp_split t
WHERE b.initiative_id = '3bd58d96-a7ae-4bdf-8767-602711cd02d3'
  AND b.budget_department = 'IT Drinkit.Tech';

-- Шаг 3: удаляем обе строки IT Drinkit.B2B
-- (CASCADE уберёт связанную строку из initiative_budget_department_2026 для 7de8d329)
DELETE FROM public.initiatives
 WHERE id IN (
   '7de8d329-803f-4c3d-851e-bbad4796219d', -- IT Drinkit / B2B / IT Drinkit.B2B (18.9м)
   '6e262f4c-a6de-487a-9a2b-9eafbf6ec918'  -- Drinkit / B2B IT Team / IT Drinkit.B2B (пустышка)
 );

\echo ''
\echo '── AFTER (внутри транзакции) ───────────────────────────────────────'
SELECT i.unit, i.team, i.initiative,
       coalesce(b.budget_department,'—') AS budget_dept,
       coalesce(b.q1,0) AS q1, coalesce(b.q2,0) AS q2,
       coalesce(b.q3,0) AS q3, coalesce(b.q4,0) AS q4,
       coalesce(b.q1+b.q2+b.q3+b.q4,0) AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id = i.id
WHERE i.unit IN ('IT Drinkit')
   OR (i.unit='Drinkit' AND i.team IN ('B2B IT Team'))
ORDER BY i.unit, i.team, i.initiative, budget_dept;

\echo ''
\echo '── CONTROL: должно быть 53 516 624 (= 34 627 159 + 18 889 465) ─────'
SELECT 'Drinkit/B2B IT Team total' AS what,
       to_char(coalesce(SUM(b.q1+b.q2+b.q3+b.q4),0),'FM999G999G999G999') AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id = i.id
WHERE i.unit='Drinkit' AND i.team='B2B IT Team';

COMMIT;
