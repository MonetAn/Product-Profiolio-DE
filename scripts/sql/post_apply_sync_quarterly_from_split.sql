-- Пост-фикс для budget_2026_full_apply_from_truth_with_rules.sql.
--
-- Apply-with-rules использует jsonb_set('{2026-Qn,cost}', …, create_missing=true).
-- В PostgreSQL jsonb_set НЕ создаёт промежуточные ключи: если в quarterly_data
-- отсутствует ключ '2026-Q1' целиком (например у только что созданных через CREATE-rule
-- инициатив), вставка cost под ним не происходит. Из-за этого после apply у нескольких
-- инициатив (Partner Support Стоимость команды, Process Core Team стоимост ькоманды)
-- initiative_budget_department_2026 заполнен корректно, а quarterly_data.cost остаётся 0.
--
-- Этот скрипт пересинхронизирует cost у всех инициатив 2026 как сумму строк разбивки,
-- используя оператор `||` (concat), который безопасно создаёт ключи кварталов.
-- Не трогает otherCosts, costFinanceConfirmed, метрики, support и т.п.
--
-- Применение (preview):  scripts/db-psql.sh -f scripts/sql/post_apply_sync_quarterly_from_split.sql
-- Применение (запись):   замени ROLLBACK на COMMIT в конце.

\set ON_ERROR_STOP on

\echo '── BEFORE: рассинхрон quarterly_data.cost vs initiative_budget_department_2026 ──'
WITH q26 AS (
  SELECT i.id,
         COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0) AS qsum
  FROM public.initiatives i
), s AS (
  SELECT initiative_id,
         sum(q1) AS q1, sum(q2) AS q2, sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  GROUP BY initiative_id
)
SELECT i.unit, i.team, i.initiative,
       round(q26.qsum) AS quarterly_now,
       round(coalesce(s.q1+s.q2+s.q3+s.q4, 0)) AS split_total,
       round(coalesce(s.q1+s.q2+s.q3+s.q4, 0) - q26.qsum) AS diff
FROM public.initiatives i
JOIN q26 ON q26.id = i.id
LEFT JOIN s ON s.initiative_id = i.id
WHERE ABS(coalesce(s.q1+s.q2+s.q3+s.q4, 0) - q26.qsum) > 0.5
ORDER BY ABS(coalesce(s.q1+s.q2+s.q3+s.q4, 0) - q26.qsum) DESC;

BEGIN;

UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb)
                       || jsonb_build_object('cost', coalesce(s.q1, 0)::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb)
                       || jsonb_build_object('cost', coalesce(s.q2, 0)::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb)
                       || jsonb_build_object('cost', coalesce(s.q3, 0)::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb)
                       || jsonb_build_object('cost', coalesce(s.q4, 0)::numeric)
         ),
    updated_at = timezone('utc'::text, now())
FROM (
  SELECT initiative_id,
         sum(q1) AS q1, sum(q2) AS q2, sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id
  AND ABS(
        coalesce((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
      + coalesce((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
      + coalesce((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
      + coalesce((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0)
      - (coalesce(s.q1,0)+coalesce(s.q2,0)+coalesce(s.q3,0)+coalesce(s.q4,0))
  ) > 0.5;

\echo '── AFTER (внутри транзакции): инициативы с остаточным рассинхроном ──'
WITH q26 AS (
  SELECT i.id,
         COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
       + COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0) AS qsum
  FROM public.initiatives i
), s AS (
  SELECT initiative_id,
         sum(q1) AS q1, sum(q2) AS q2, sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  GROUP BY initiative_id
)
SELECT count(*) AS still_out_of_sync
FROM public.initiatives i
JOIN q26 ON q26.id = i.id
LEFT JOIN s ON s.initiative_id = i.id
WHERE ABS(coalesce(s.q1+s.q2+s.q3+s.q4, 0) - q26.qsum) > 0.5;

ROLLBACK;
