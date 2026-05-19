-- =============================================================================
-- После align: split ← quarterly (cost 2026). COMMIT в конце.
--
--  • Обнуляет split у «сирот» и где cost=0
--  • Пересчитывает доли департаментов под quarterly
--  • Добавляет одну строку split инициативам с cost, но без split
-- =============================================================================

BEGIN;

-- A) Сироты (команды вне baseline): split = 0
UPDATE public.initiative_budget_department_2026 b
SET q1 = 0, q2 = 0, q3 = 0, q4 = 0, updated_at = timezone('utc'::text, now())
FROM public.initiatives i
WHERE b.initiative_id = i.id
  AND i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 t
    WHERE t.unit = i.unit AND t.team = i.team
  );

-- B) Инициативы с cost, но без ни одной строки split (включая заглушку FAP/Codo)
WITH backfill_inits AS (
  SELECT i.id AS initiative_id
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
    AND (
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ) > 0
    AND EXISTS (
      SELECT 1 FROM public.team_budget_baseline_2026 t
      WHERE t.unit = i.unit AND t.team = i.team
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.initiative_budget_department_2026 b WHERE b.initiative_id = i.id
    )
)
INSERT INTO public.initiative_budget_department_2026 (
  initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, updated_at
)
SELECT
  i.id,
  '(из quarterly, без CSV split)',
  GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0))),
  GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0))),
  GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0))),
  GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0))),
  EXISTS (
    SELECT 1
    FROM public.team_budget_baseline_2026 tb
    WHERE tb.unit = i.unit
      AND tb.team = i.team
      AND tb.rub_pnl_it >= tb.rub_all
  ),
  timezone('utc'::text, now())
FROM public.initiatives i
INNER JOIN backfill_inits bi ON bi.initiative_id = i.id;

-- C) Пересчёт split по долям (targets в том же statement — иначе 42P01 в SQL Editor)
WITH
targets AS (
  SELECT
    i.id AS initiative_id,
    GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)))::bigint AS t1,
    GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)))::bigint AS t2,
    GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)))::bigint AS t3,
    GREATEST(0, round(COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)))::bigint AS t4
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.team_budget_baseline_2026 t
      WHERE t.unit = i.unit AND t.team = i.team
    )
    AND (
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ) > 0
),
base AS (
  SELECT
    b.initiative_id,
    b.budget_department,
    b.q1,
    b.q2,
    b.q3,
    b.q4,
    t.t1,
    t.t2,
    t.t3,
    t.t4,
    sum(b.q1) OVER w AS s1,
    sum(b.q2) OVER w AS s2,
    sum(b.q3) OVER w AS s3,
    sum(b.q4) OVER w AS s4,
    count(*) OVER w AS dept_cnt
  FROM public.initiative_budget_department_2026 b
  INNER JOIN targets t ON t.initiative_id = b.initiative_id
  WINDOW w AS (PARTITION BY b.initiative_id)
),
scaled AS (
  SELECT
    initiative_id,
    budget_department,
    CASE WHEN t1 = 0 THEN 0::numeric WHEN s1 > 0 THEN round((q1 / s1) * t1) WHEN t1 > 0 THEN round(t1::numeric / dept_cnt) ELSE 0 END AS nq1,
    CASE WHEN t2 = 0 THEN 0::numeric WHEN s2 > 0 THEN round((q2 / s2) * t2) WHEN t2 > 0 THEN round(t2::numeric / dept_cnt) ELSE 0 END AS nq2,
    CASE WHEN t3 = 0 THEN 0::numeric WHEN s3 > 0 THEN round((q3 / s3) * t3) WHEN t3 > 0 THEN round(t3::numeric / dept_cnt) ELSE 0 END AS nq3,
    CASE WHEN t4 = 0 THEN 0::numeric WHEN s4 > 0 THEN round((q4 / s4) * t4) WHEN t4 > 0 THEN round(t4::numeric / dept_cnt) ELSE 0 END AS nq4,
    t1, t2, t3, t4
  FROM base
),
sums AS (
  SELECT initiative_id, max(t1) AS t1, max(t2) AS t2, max(t3) AS t3, max(t4) AS t4,
    sum(nq1) AS sum_nq1, sum(nq2) AS sum_nq2, sum(nq3) AS sum_nq3, sum(nq4) AS sum_nq4
  FROM scaled
  GROUP BY initiative_id
),
ranked AS (
  SELECT
    s.initiative_id, s.budget_department, s.nq1, s.nq2, s.nq3, s.nq4,
    sm.t1 - sm.sum_nq1 AS rem1, sm.t2 - sm.sum_nq2 AS rem2, sm.t3 - sm.sum_nq3 AS rem3, sm.t4 - sm.sum_nq4 AS rem4,
    row_number() OVER (PARTITION BY s.initiative_id ORDER BY s.nq1 DESC, s.budget_department) AS rn1,
    row_number() OVER (PARTITION BY s.initiative_id ORDER BY s.nq2 DESC, s.budget_department) AS rn2,
    row_number() OVER (PARTITION BY s.initiative_id ORDER BY s.nq3 DESC, s.budget_department) AS rn3,
    row_number() OVER (PARTITION BY s.initiative_id ORDER BY s.nq4 DESC, s.budget_department) AS rn4
  FROM scaled s
  INNER JOIN sums sm ON sm.initiative_id = s.initiative_id
),
final AS (
  SELECT
    initiative_id, budget_department,
    GREATEST(0::numeric, nq1 + CASE WHEN rem1 > 0 AND rn1 <= rem1 THEN 1 WHEN rem1 < 0 AND rn1 <= (-rem1) AND nq1 > 0 THEN -1 ELSE 0 END) AS fq1,
    GREATEST(0::numeric, nq2 + CASE WHEN rem2 > 0 AND rn2 <= rem2 THEN 1 WHEN rem2 < 0 AND rn2 <= (-rem2) AND nq2 > 0 THEN -1 ELSE 0 END) AS fq2,
    GREATEST(0::numeric, nq3 + CASE WHEN rem3 > 0 AND rn3 <= rem3 THEN 1 WHEN rem3 < 0 AND rn3 <= (-rem3) AND nq3 > 0 THEN -1 ELSE 0 END) AS fq3,
    GREATEST(0::numeric, nq4 + CASE WHEN rem4 > 0 AND rn4 <= rem4 THEN 1 WHEN rem4 < 0 AND rn4 <= (-rem4) AND nq4 > 0 THEN -1 ELSE 0 END) AS fq4
  FROM ranked
)
UPDATE public.initiative_budget_department_2026 b
SET q1 = f.fq1, q2 = f.fq2, q3 = f.fq3, q4 = f.fq4, updated_at = timezone('utc'::text, now())
FROM final f
WHERE b.initiative_id = f.initiative_id AND b.budget_department = f.budget_department;

-- D) Контроль
SELECT
  (SELECT truth_total_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_all,
  (SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint FROM public.initiatives WHERE deleted_at IS NULL) AS sum_quarterly,
  (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
   FROM public.initiative_budget_department_2026 b
   INNER JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL) AS sum_split_all;

SELECT
  t.sum_quarterly,
  t.sum_split_all,
  (t.sum_quarterly - t.sum_split_all) AS gap_rub,
  n.inits_quarterly_no_split,
  n.rub_in_no_split_inits,
  CASE
    WHEN abs(t.sum_quarterly - t.sum_split_all) <= 500000
      AND n.inits_quarterly_no_split = 0
    THEN 'OK → split ≈ quarterly, можно в UI'
    WHEN abs(t.sum_quarterly - t.sum_split_all) <= 5000000
    THEN 'OK (округление) → COMMIT был, перезагрузите дашборд'
    ELSE 'CHECK → пришлите строку'
  END AS verdict
FROM (
  SELECT
    (SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint FROM public.initiatives WHERE deleted_at IS NULL) AS sum_quarterly,
    (SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
     FROM public.initiative_budget_department_2026 b
     INNER JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL) AS sum_split_all
) t
CROSS JOIN LATERAL (
  SELECT
    count(*)::int AS inits_quarterly_no_split,
    coalesce(round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint, 0) AS rub_in_no_split_inits
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
    AND COALESCE(i.is_timeline_stub, false) = false
    AND (
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ) > 0
    AND NOT EXISTS (SELECT 1 FROM public.initiative_budget_department_2026 b WHERE b.initiative_id = i.id)
) n;

-- ROLLBACK;
COMMIT;
