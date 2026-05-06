-- Сверка по ОДНОМУ полю initiative (имя): сумма всех строк CSV vs сумма разбивки в БД.
-- Имеет смысл ПОСЛЕ budget_truth_sync_allocations.sql.
-- Показывает только те имена, где расхождение по любому кварталу > 1 ₽.

WITH
truth AS (
  SELECT
    trim(initiative) AS iname,
    sum(q1) AS t1,
    sum(q2) AS t2,
    sum(q3) AS t3,
    sum(q4) AS t4
  FROM public._budget_truth_csv
  GROUP BY trim(initiative)
),
db_alloc AS (
  SELECT
    trim(i.initiative) AS iname,
    round(sum(b.q1))::bigint AS d1,
    round(sum(b.q2))::bigint AS d2,
    round(sum(b.q3))::bigint AS d3,
    round(sum(b.q4))::bigint AS d4
  FROM public.initiative_budget_department_2026 b
  INNER JOIN public.initiatives i ON i.id = b.initiative_id
  WHERE COALESCE(i.is_timeline_stub, false) = false
  GROUP BY trim(i.initiative)
)
SELECT
  COALESCE(t.iname, d.iname) AS initiative,
  t.t1 AS truth_q1,
  d.d1 AS db_sum_q1,
  t.t2 AS truth_q2,
  d.d2 AS db_sum_q2,
  t.t3 AS truth_q3,
  d.d3 AS db_sum_q3,
  t.t4 AS truth_q4,
  d.d4 AS db_sum_q4
FROM truth t
FULL OUTER JOIN db_alloc d ON d.iname = t.iname
WHERE
     abs(COALESCE(t.t1, 0) - COALESCE(d.d1, 0)) > 1
  OR abs(COALESCE(t.t2, 0) - COALESCE(d.d2, 0)) > 1
  OR abs(COALESCE(t.t3, 0) - COALESCE(d.d3, 0)) > 1
  OR abs(COALESCE(t.t4, 0) - COALESCE(d.d4, 0)) > 1
ORDER BY initiative;
