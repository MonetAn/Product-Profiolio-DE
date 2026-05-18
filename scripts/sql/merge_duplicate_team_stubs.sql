-- Объединить несколько заглушек (is_timeline_stub) одной команды в одну «Не распределено».
-- Supabase SQL Editor: выполните ВЕСЬ файл одним запуском (Run).
--
-- 1) Измените merge_unit и merge_team в INSERT ниже (внутри BEGIN).
-- 2) По умолчанию ROLLBACK — только просмотр. Для записи замените ROLLBACK на COMMIT.

BEGIN;

-- ========== НАСТРОЙКА (измените unit / team) ==========
DROP TABLE IF EXISTS merge_stub_cfg;
CREATE TEMP TABLE merge_stub_cfg (
  merge_unit text NOT NULL,
  merge_team text NOT NULL
);

INSERT INTO merge_stub_cfg (merge_unit, merge_team)
VALUES ('App&Web', 'X-men(u)');

-- ========== PREVIEW (до изменений) ==========
SELECT merge_unit, merge_team, 'config' AS section
FROM merge_stub_cfg;

SELECT
  i.id,
  i.initiative,
  i.is_timeline_stub,
  ROUND(
    COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
  ) AS y2026_qd_cost,
  ROUND(COALESCE((
    SELECT SUM(b.q1 + b.q2 + b.q3 + b.q4)
    FROM public.initiative_budget_department_2026 b
    WHERE b.initiative_id = i.id
  ), 0)) AS y2026_split
FROM public.initiatives i
CROSS JOIN merge_stub_cfg c
WHERE i.unit = c.merge_unit
  AND i.team = c.merge_team
  AND i.is_timeline_stub = true
  AND i.deleted_at IS NULL
ORDER BY i.created_at, i.initiative;

SELECT COUNT(*) AS stub_count_before
FROM public.initiatives i
CROSS JOIN merge_stub_cfg c
WHERE i.unit = c.merge_unit
  AND i.team = c.merge_team
  AND i.is_timeline_stub = true
  AND i.deleted_at IS NULL;

-- ========== ПРИМЕНЕНИЕ ==========
DROP TABLE IF EXISTS _tmp_team_stubs;
CREATE TEMP TABLE _tmp_team_stubs ON COMMIT DROP AS
SELECT i.id, i.initiative, i.created_at
FROM public.initiatives i
CROSS JOIN merge_stub_cfg c
WHERE i.unit = c.merge_unit
  AND i.team = c.merge_team
  AND i.is_timeline_stub = true
  AND i.deleted_at IS NULL;

DO $$
DECLARE
  n int;
  u text;
  t text;
BEGIN
  SELECT COUNT(*) INTO n FROM _tmp_team_stubs;
  IF n < 2 THEN
    SELECT merge_unit, merge_team INTO u, t FROM merge_stub_cfg LIMIT 1;
    RAISE EXCEPTION 'Нужно минимум 2 заглушки в % / % (найдено %). Проверьте unit/team в INSERT.',
      u, t, n;
  END IF;
END $$;

DROP TABLE IF EXISTS _tmp_keeper;
CREATE TEMP TABLE _tmp_keeper (id uuid PRIMARY KEY, initiative text) ON COMMIT DROP;

INSERT INTO _tmp_keeper (id, initiative)
SELECT id, initiative
FROM _tmp_team_stubs
ORDER BY
  CASE
    WHEN initiative ~* '(стоимость команды|фот)' THEN 0
    ELSE 1
  END,
  CASE WHEN initiative ~* '2026' THEN 0 ELSE 1 END,
  created_at NULLS LAST,
  initiative
LIMIT 1;

DROP TABLE IF EXISTS _tmp_losers;
CREATE TEMP TABLE _tmp_losers (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _tmp_losers (id)
SELECT id FROM _tmp_team_stubs
WHERE id NOT IN (SELECT id FROM _tmp_keeper);

SELECT k.id AS keeper_id, k.initiative AS keeper_initiative
FROM _tmp_keeper k;

SELECT s.id AS loser_id, s.initiative AS loser_initiative
FROM public.initiatives s
JOIN _tmp_losers l ON l.id = s.id;

DROP TABLE IF EXISTS _tmp_loser_budget;
CREATE TEMP TABLE _tmp_loser_budget ON COMMIT DROP AS
SELECT
  (SELECT id FROM _tmp_keeper) AS keeper_id,
  b.budget_department,
  SUM(b.q1)::numeric AS dq1,
  SUM(b.q2)::numeric AS dq2,
  SUM(b.q3)::numeric AS dq3,
  SUM(b.q4)::numeric AS dq4,
  bool_or(b.is_in_pnl_it) AS is_in_pnl_it
FROM public.initiative_budget_department_2026 b
JOIN _tmp_losers l ON l.id = b.initiative_id
GROUP BY b.budget_department;

INSERT INTO public.initiative_budget_department_2026 (
  initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, created_at, updated_at
)
SELECT
  keeper_id,
  budget_department,
  dq1,
  dq2,
  dq3,
  dq4,
  is_in_pnl_it,
  timezone('utc'::text, now()),
  timezone('utc'::text, now())
FROM _tmp_loser_budget
ON CONFLICT (initiative_id, budget_department) DO UPDATE SET
  q1 = public.initiative_budget_department_2026.q1 + EXCLUDED.q1,
  q2 = public.initiative_budget_department_2026.q2 + EXCLUDED.q2,
  q3 = public.initiative_budget_department_2026.q3 + EXCLUDED.q3,
  q4 = public.initiative_budget_department_2026.q4 + EXCLUDED.q4,
  is_in_pnl_it = public.initiative_budget_department_2026.is_in_pnl_it OR EXCLUDED.is_in_pnl_it,
  updated_at = timezone('utc'::text, now());

DELETE FROM public.initiative_budget_department_2026
WHERE initiative_id IN (SELECT id FROM _tmp_losers);

UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q1, 0)::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q2, 0)::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q3, 0)::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q4, 0)::numeric)
         ),
    updated_at = timezone('utc'::text, now())
FROM (
  SELECT initiative_id,
         sum(q1) AS q1,
         sum(q2) AS q2,
         sum(q3) AS q3,
         sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id = (SELECT id FROM _tmp_keeper)
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id;

UPDATE public.initiatives i
SET is_timeline_stub = false,
    quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric)
         ),
    updated_at = timezone('utc'::text, now())
WHERE i.id IN (SELECT id FROM _tmp_losers);

-- ========== AFTER (внутри той же транзакции) ==========
SELECT
  i.id,
  i.initiative,
  i.is_timeline_stub,
  ROUND(
    COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
    + COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
  ) AS y2026_qd_cost
FROM public.initiatives i
CROSS JOIN merge_stub_cfg c
WHERE i.unit = c.merge_unit
  AND i.team = c.merge_team
  AND (
    i.is_timeline_stub = true
    OR i.id IN (SELECT id FROM _tmp_losers)
  )
ORDER BY i.is_timeline_stub DESC, i.initiative;

ROLLBACK;
