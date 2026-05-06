-- Пост-CSV-apply версия fix_it_drinkit_b2b_split.sql.
--
-- Контекст: budget_2026_full_apply_from_truth_with_rules.sql пересоздаёт инициативу
-- "IT Drinkit.B2B" в IT Drinkit/B2B (как требует CSV). Чтобы вернуться к ручной
-- договорённости «B2B-бюджет распилить между Barista Experience и ERP Manufacture
-- внутри их IT Drinkit.Tech», прогоните этот скрипт сразу после apply-with-rules.
--
-- Идемпотентность: после COMMIT повторный запуск увидит, что источника уже нет,
-- и поднимет понятную ошибку «IT Drinkit.B2B источник не найден».
--
-- Применение (preview): scripts/db-psql.sh -f scripts/sql/fix_it_drinkit_b2b_split_post_apply.sql
-- Применение (запись): замени "ROLLBACK" на "COMMIT" в конце файла и запусти ещё раз.

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
   OR (i.unit='Drinkit' AND i.team='B2B IT Team' AND i.initiative IN ('Barista Experience','ERP Manufacture'))
ORDER BY i.unit, i.team, i.initiative, budget_dept;

BEGIN;

CREATE TEMP TABLE _tmp_b2b_src ON COMMIT DROP AS
SELECT i.id AS src_id, b.q1, b.q2, b.q3, b.q4
FROM public.initiatives i
JOIN public.initiative_budget_department_2026 b
  ON b.initiative_id = i.id
WHERE i.unit = 'IT Drinkit'
  AND i.team = 'B2B'
  AND i.initiative = 'IT Drinkit.B2B'
  AND b.budget_department = 'IT Drinkit.B2B'
  AND coalesce(i.is_timeline_stub, false) = false;

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM _tmp_b2b_src;
  IF n = 0 THEN
    RAISE EXCEPTION 'IT Drinkit.B2B источник не найден — скорее всего скрипт уже применён или apply-with-rules не запускался';
  END IF;
  IF n > 1 THEN
    RAISE EXCEPTION 'Нашлось несколько источников IT Drinkit.B2B (%) — нужна ручная разбивка', n;
  END IF;
END $$;

CREATE TEMP TABLE _tmp_b2b_split ON COMMIT DROP AS
WITH base AS (
  SELECT
    (SELECT (q1+q2+q3+q4) FROM public.initiative_budget_department_2026
      WHERE initiative_id = '9d8eb058-2a80-48e1-a2a9-f748e01fb353'
        AND budget_department = 'IT Drinkit.Tech') AS barista_total,
    (SELECT (q1+q2+q3+q4) FROM public.initiative_budget_department_2026
      WHERE initiative_id = '3bd58d96-a7ae-4bdf-8767-602711cd02d3'
        AND budget_department = 'IT Drinkit.Tech') AS erp_total
)
SELECT
  src.q1 * base.barista_total / NULLIF(base.barista_total + base.erp_total, 0) AS barista_q1,
  src.q2 * base.barista_total / NULLIF(base.barista_total + base.erp_total, 0) AS barista_q2,
  src.q3 * base.barista_total / NULLIF(base.barista_total + base.erp_total, 0) AS barista_q3,
  src.q4 * base.barista_total / NULLIF(base.barista_total + base.erp_total, 0) AS barista_q4,
  src.q1 * base.erp_total     / NULLIF(base.barista_total + base.erp_total, 0) AS erp_q1,
  src.q2 * base.erp_total     / NULLIF(base.barista_total + base.erp_total, 0) AS erp_q2,
  src.q3 * base.erp_total     / NULLIF(base.barista_total + base.erp_total, 0) AS erp_q3,
  src.q4 * base.erp_total     / NULLIF(base.barista_total + base.erp_total, 0) AS erp_q4
FROM _tmp_b2b_src src, base;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM _tmp_b2b_split;
  IF r.barista_q1 IS NULL THEN
    RAISE EXCEPTION 'Нет IT Drinkit.Tech у Barista/ERP — пропорция не считается. Проверьте, прошёл ли apply-with-rules полностью.';
  END IF;
END $$;

\echo ''
\echo '── DELTA (что прибавится к Barista/ERP в IT Drinkit.Tech) ──────────'
SELECT * FROM _tmp_b2b_split;

UPDATE public.initiative_budget_department_2026 AS b
SET q1 = b.q1 + t.barista_q1,
    q2 = b.q2 + t.barista_q2,
    q3 = b.q3 + t.barista_q3,
    q4 = b.q4 + t.barista_q4,
    updated_at = now()
FROM _tmp_b2b_split t
WHERE b.initiative_id = '9d8eb058-2a80-48e1-a2a9-f748e01fb353'
  AND b.budget_department = 'IT Drinkit.Tech';

UPDATE public.initiative_budget_department_2026 AS b
SET q1 = b.q1 + t.erp_q1,
    q2 = b.q2 + t.erp_q2,
    q3 = b.q3 + t.erp_q3,
    q4 = b.q4 + t.erp_q4,
    updated_at = now()
FROM _tmp_b2b_split t
WHERE b.initiative_id = '3bd58d96-a7ae-4bdf-8767-602711cd02d3'
  AND b.budget_department = 'IT Drinkit.Tech';

-- Перевыставим quarterly_data.cost у Barista и ERP по сумме их разбивки.
UPDATE public.initiatives i
SET quarterly_data =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(i.quarterly_data, '{}'::jsonb),
          '{2026-Q1,cost}', to_jsonb(s.q1), true
        ),
        '{2026-Q2,cost}', to_jsonb(s.q2), true
      ),
      '{2026-Q3,cost}', to_jsonb(s.q3), true
    ),
    '{2026-Q4,cost}', to_jsonb(s.q4), true
  ),
  updated_at = timezone('utc'::text, now())
FROM (
  SELECT initiative_id,
         sum(q1) AS q1, sum(q2) AS q2,
         sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id IN (
    '9d8eb058-2a80-48e1-a2a9-f748e01fb353',
    '3bd58d96-a7ae-4bdf-8767-602711cd02d3'
  )
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id;

-- Удаляем источник; CASCADE снимет его строки в initiative_budget_department_2026.
DELETE FROM public.initiatives
 WHERE id IN (SELECT src_id FROM _tmp_b2b_src);

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
   OR (i.unit='Drinkit' AND i.team='B2B IT Team' AND i.initiative IN ('Barista Experience','ERP Manufacture'))
ORDER BY i.unit, i.team, i.initiative, budget_dept;

ROLLBACK;
