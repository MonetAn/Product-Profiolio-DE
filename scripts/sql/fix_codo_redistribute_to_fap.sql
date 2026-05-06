-- Удалить инициативу "Codo Стоимость команды Q1 25 - Q4 26" в юните FAP,
-- её бюджет (IT.FAP.Management: 137237/136598/129540/133038 = 536 413/год)
-- разделить ПО КВАРТАЛАМ поровну между ОСТАЛЬНЫМИ 31 инициативой FAP, у
-- которых уже есть строка budget_department='IT.FAP.Management'.
--
-- Контроль: сумма IT.FAP.Management по юниту FAP до и после должна совпасть
-- (32 × 536 413 = 17 165 216 → после: 31 × ~553 716.6 = 17 165 216).
--
-- Применение (preview):
--   scripts/db-psql.sh -f scripts/sql/fix_codo_redistribute_to_fap.sql
-- Применение (запись):
--   замени "ROLLBACK;" на "COMMIT;" и запусти ещё раз.

\set ON_ERROR_STOP on

\echo ''
\echo '── BEFORE: сумма IT.FAP.Management по юниту FAP ────────────────────'
SELECT to_char(SUM(b.q1+b.q2+b.q3+b.q4),'FM999G999G999G999') AS total_management
FROM public.initiative_budget_department_2026 b
JOIN public.initiatives i ON i.id=b.initiative_id
WHERE i.unit='FAP' AND b.budget_department='IT.FAP.Management';

\echo ''
\echo '── BEFORE: пример 3 строк IT.FAP.Management ────────────────────────'
SELECT i.team, i.initiative, b.q1, b.q2, b.q3, b.q4, (b.q1+b.q2+b.q3+b.q4) AS total
FROM public.initiative_budget_department_2026 b
JOIN public.initiatives i ON i.id=b.initiative_id
WHERE i.unit='FAP' AND b.budget_department='IT.FAP.Management'
ORDER BY i.team, i.initiative LIMIT 3;

BEGIN;

-- Зафиксируем дельту в TEMP TABLE до UPDATE'а.
CREATE TEMP TABLE _tmp_codo_split ON COMMIT DROP AS
WITH src AS (
  SELECT q1, q2, q3, q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id = '3660c78b-11ff-4d08-8eec-09dda82036dd'
    AND budget_department = 'IT.FAP.Management'
),
recipients AS (
  SELECT COUNT(*)::numeric AS n
  FROM public.initiative_budget_department_2026 b
  JOIN public.initiatives i ON i.id=b.initiative_id
  WHERE i.unit='FAP'
    AND b.budget_department='IT.FAP.Management'
    AND i.id <> '3660c78b-11ff-4d08-8eec-09dda82036dd'
)
SELECT recipients.n AS n,
       src.q1 / recipients.n AS dq1,
       src.q2 / recipients.n AS dq2,
       src.q3 / recipients.n AS dq3,
       src.q4 / recipients.n AS dq4
FROM src, recipients;

-- Sanity: убедимся что есть и источник и получатели
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM _tmp_codo_split;
  IF r IS NULL OR r.n = 0 THEN
    RAISE EXCEPTION 'Codo source not found или нет получателей — возможно скрипт уже применён';
  END IF;
  RAISE NOTICE 'Получателей: %, дельта по q1: %', r.n, r.dq1;
END $$;

-- 1) Прибавляем дельту ко всем 31 строке IT.FAP.Management в FAP (кроме Codo).
UPDATE public.initiative_budget_department_2026 AS b
SET q1 = b.q1 + t.dq1,
    q2 = b.q2 + t.dq2,
    q3 = b.q3 + t.dq3,
    q4 = b.q4 + t.dq4,
    updated_at = now()
FROM _tmp_codo_split t,
     public.initiatives i
WHERE i.id = b.initiative_id
  AND i.unit = 'FAP'
  AND b.budget_department = 'IT.FAP.Management'
  AND i.id <> '3660c78b-11ff-4d08-8eec-09dda82036dd';

-- 2) Удаляем инициативу Codo (CASCADE снимет её строку IT.FAP.Management)
DELETE FROM public.initiatives
 WHERE id = '3660c78b-11ff-4d08-8eec-09dda82036dd';

\echo ''
\echo '── AFTER: сумма IT.FAP.Management по юниту FAP ─────────────────────'
SELECT to_char(SUM(b.q1+b.q2+b.q3+b.q4),'FM999G999G999G999') AS total_management
FROM public.initiative_budget_department_2026 b
JOIN public.initiatives i ON i.id=b.initiative_id
WHERE i.unit='FAP' AND b.budget_department='IT.FAP.Management';

\echo ''
\echo '── AFTER: те же 3 строки IT.FAP.Management ─────────────────────────'
SELECT i.team, i.initiative,
       round(b.q1, 4) AS q1, round(b.q2, 4) AS q2,
       round(b.q3, 4) AS q3, round(b.q4, 4) AS q4,
       round(b.q1+b.q2+b.q3+b.q4, 4) AS total
FROM public.initiative_budget_department_2026 b
JOIN public.initiatives i ON i.id=b.initiative_id
WHERE i.unit='FAP' AND b.budget_department='IT.FAP.Management'
ORDER BY i.team, i.initiative LIMIT 3;

\echo ''
\echo '── AFTER: Codo больше не существует? ───────────────────────────────'
SELECT COUNT(*) AS codo_left
FROM public.initiatives WHERE id='3660c78b-11ff-4d08-8eec-09dda82036dd';

COMMIT;
