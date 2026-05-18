-- Объединить несколько заглушек (is_timeline_stub) одной команды в одну «Не распределено».
-- Бюджет 2026 (initiative_budget_department_2026 + quarterly_data.cost) переносится на каноническую
-- заглушку; у лишних снимается флаг заглушки (инициатива остаётся в списке, но не как остаток).
--
-- Пример: две «Нераспределено» в X-men(u) — случайная инициатива с is_timeline_stub и
-- «Стоимость команды X-men(u) 2026» / «ФОТ …».
--
-- Перед записью задайте unit и team ниже. Диагностика X-men: scripts/sql/diag_xmen_merge.sql
--
-- Preview:  scripts/db-psql.sh -f scripts/sql/merge_duplicate_team_stubs.sql
-- Запись:   замените ROLLBACK на COMMIT в конце.

\set ON_ERROR_STOP on

\if :{?merge_unit}
\else
\set merge_unit 'App&Web'
\endif

\if :{?merge_team}
\else
\set merge_team 'X-men(u)'
\endif

\echo '── Unit/team ─────────────────────────────────────────────────────────'
\echo :merge_unit / :merge_team

\echo ''
\echo '── Stubs BEFORE ────────────────────────────────────────────────────'
SELECT id, initiative, is_timeline_stub,
       ROUND(COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0)) AS y2026_qd_cost,
       ROUND(COALESCE((SELECT SUM(b.q1+b.q2+b.q3+b.q4)
                       FROM public.initiative_budget_department_2026 b
                       WHERE b.initiative_id = i.id), 0)) AS y2026_split
FROM public.initiatives i
WHERE unit = :'merge_unit' AND team = :'merge_team' AND is_timeline_stub = true
  AND deleted_at IS NULL
ORDER BY created_at, initiative;

BEGIN;

DROP TABLE IF EXISTS _tmp_team_stubs;
CREATE TEMP TABLE _tmp_team_stubs ON COMMIT DROP AS
SELECT id, initiative, created_at
FROM public.initiatives
WHERE unit = :'merge_unit'
  AND team = :'merge_team'
  AND is_timeline_stub = true
  AND deleted_at IS NULL;

\echo ''
\echo '── stub count (нужно >= 2) ─────────────────────────────────────────'
SELECT COUNT(*) AS stub_count FROM _tmp_team_stubs;

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

\echo ''
\echo '── Keeper stub ─────────────────────────────────────────────────────'
SELECT * FROM _tmp_keeper;

DROP TABLE IF EXISTS _tmp_losers;
CREATE TEMP TABLE _tmp_losers (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _tmp_losers (id)
SELECT id FROM _tmp_team_stubs
WHERE id NOT IN (SELECT id FROM _tmp_keeper);

\echo ''
\echo '── Loser stubs (budget will move to keeper) ──────────────────────────'
SELECT s.id, s.initiative FROM public.initiatives s
JOIN _tmp_losers l ON l.id = s.id;

-- Суммы budget_department с loser → keeper (UPSERT).
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
  keeper_id, budget_department, dq1, dq2, dq3, dq4, is_in_pnl_it,
  timezone('utc'::text, now()), timezone('utc'::text, now())
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

-- Синхрон quarterly_data.cost у keeper из split.
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
         sum(q1) AS q1, sum(q2) AS q2, sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id = (SELECT id FROM _tmp_keeper)
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id;

-- У loser: снять заглушку и обнулить cost 2026 (деньги уже на keeper).
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

\echo ''
\echo '── AFTER (внутри транзакции) ───────────────────────────────────────'
SELECT id, initiative, is_timeline_stub,
       ROUND(COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0)) AS y2026_qd_cost
FROM public.initiatives
WHERE unit = :'merge_unit' AND team = :'merge_team'
  AND (is_timeline_stub = true OR id IN (SELECT id FROM _tmp_losers))
ORDER BY is_timeline_stub DESC, initiative;

ROLLBACK;
