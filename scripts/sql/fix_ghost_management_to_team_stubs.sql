-- Перенести «менеджмент-аллокацию» ghost-инициатив (тех, у которых есть cost в 2026,
-- но в коэффициентном CSV ни один человек не работает) на стубы их собственных команд.
--
-- Идея: ghost'ы — это инициативы, на которые в исходной выгрузке ошибочно был
-- размазан менеджмент. Чтобы он не висел на нерабочих инициативах, переносим эти
-- деньги на «Стоимость команды X»-стубы. Тотал бюджета 2026 не меняется (math invariant).
--
-- Источник списка ghost'ов: scripts/out/ghost_initiatives_2026.tsv
-- Перед запуском убедись, что там актуальный список (после твоей ручной проверки).
--
-- Применение (preview): scripts/db-psql.sh -f scripts/sql/fix_ghost_management_to_team_stubs.sql
-- Применение (запись):  замени ROLLBACK на COMMIT в самом конце.

\set ON_ERROR_STOP on

\echo '── BEFORE: total in DB ──────────────────────────────────────────────'
SELECT
  ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS split_total,
  ROUND(SUM(b.q1+b.q2+b.q3+b.q4) FILTER (WHERE b.is_in_pnl_it))::bigint AS split_pnl_it_total
FROM public.initiative_budget_department_2026 b;

BEGIN;

-- 1) Подгружаем ghost-id из TSV.
DROP TABLE IF EXISTS _tmp_ghost_ids;
CREATE TEMP TABLE _tmp_ghost_ids (id uuid PRIMARY KEY) ON COMMIT DROP;

\copy _tmp_ghost_ids(id) FROM PROGRAM 'awk -F"\t" ''NR>1 {print $8}'' "scripts/out/ghost_initiatives_2026.tsv"' WITH CSV;

\echo ''
\echo '── ghost-кандидатов загружено ─────────────────────────────────────────'
SELECT COUNT(*) AS ghost_count FROM _tmp_ghost_ids;

-- 2) Команды, в которых есть ghost'ы, но нет стуба → создать новые stub-инициативы.
DROP TABLE IF EXISTS _tmp_missing_stubs;
CREATE TEMP TABLE _tmp_missing_stubs ON COMMIT DROP AS
SELECT DISTINCT g.unit, g.team
FROM public.initiatives g
JOIN _tmp_ghost_ids x ON x.id = g.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.initiatives s
  WHERE s.unit = g.unit
    AND s.team = g.team
    AND s.is_timeline_stub = true
);

\echo ''
\echo '── команды без стубов, в которых будут созданы новые ─────────────────'
SELECT * FROM _tmp_missing_stubs ORDER BY unit, team;

INSERT INTO public.initiatives (unit, team, initiative, is_timeline_stub, stakeholders_list, description, documentation_link, stakeholders, quarterly_data, created_at, updated_at)
SELECT
  unit,
  team,
  'Стоимость команды ' || team || ' 2026',
  true,
  ARRAY[]::text[],
  '',
  '',
  '',
  '{}'::jsonb,
  timezone('utc'::text, now()),
  timezone('utc'::text, now())
FROM _tmp_missing_stubs;

-- 3) Маппинг ghost.id → stub.id (стуб той же команды, что и ghost).
DROP TABLE IF EXISTS _tmp_ghost_to_stub;
CREATE TEMP TABLE _tmp_ghost_to_stub ON COMMIT DROP AS
SELECT g.id AS ghost_id, s.id AS stub_id, g.unit, g.team, g.initiative AS ghost_initiative, s.initiative AS stub_initiative
FROM public.initiatives g
JOIN _tmp_ghost_ids x ON x.id = g.id
JOIN public.initiatives s
  ON s.unit = g.unit AND s.team = g.team AND s.is_timeline_stub = true
ORDER BY g.unit, g.team, g.initiative;

\echo ''
\echo '── маппинг ghost → стуб (первые 10) ──────────────────────────────────'
SELECT unit, team, ghost_initiative, stub_initiative FROM _tmp_ghost_to_stub LIMIT 10;

-- Если у какой-то ghost не нашлось стуба — это ошибка (мы создавали все недостающие выше).
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM _tmp_ghost_ids x
  WHERE NOT EXISTS (SELECT 1 FROM _tmp_ghost_to_stub m WHERE m.ghost_id = x.id);
  IF n > 0 THEN
    RAISE EXCEPTION 'Не удалось замапить ghost'' на стуб (% штук) — проверь команды', n;
  END IF;
END $$;

-- Если ghost — это сам стуб (не должно быть, но защитимся): не переносим.
DELETE FROM _tmp_ghost_to_stub WHERE ghost_id = stub_id;

-- 4) Перенос строк initiative_budget_department_2026 ghost'ов на стуб'ы.
-- Сначала суммируем delta'ы, чтобы корректно сложить в стуб.
DROP TABLE IF EXISTS _tmp_ghost_rows;
CREATE TEMP TABLE _tmp_ghost_rows ON COMMIT DROP AS
SELECT
  m.stub_id AS stub_id,
  b.budget_department,
  SUM(b.q1)::numeric AS dq1,
  SUM(b.q2)::numeric AS dq2,
  SUM(b.q3)::numeric AS dq3,
  SUM(b.q4)::numeric AS dq4,
  bool_or(b.is_in_pnl_it) AS is_in_pnl_it
FROM public.initiative_budget_department_2026 b
JOIN _tmp_ghost_to_stub m ON m.ghost_id = b.initiative_id
GROUP BY m.stub_id, b.budget_department;

\echo ''
\echo '── deltas: сколько добавится к стубам по budget_department (top 10 по сумме) ──'
SELECT s.unit, s.team, s.initiative AS stub_initiative, t.budget_department,
       ROUND(t.dq1+t.dq2+t.dq3+t.dq4) AS delta_total
FROM _tmp_ghost_rows t
JOIN public.initiatives s ON s.id = t.stub_id
ORDER BY t.dq1+t.dq2+t.dq3+t.dq4 DESC LIMIT 10;

-- INSERT с UPSERT: где у стуба уже есть строка с тем же budget_department — суммируем.
INSERT INTO public.initiative_budget_department_2026 (initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, created_at, updated_at)
SELECT
  stub_id, budget_department, dq1, dq2, dq3, dq4, is_in_pnl_it,
  timezone('utc'::text, now()), timezone('utc'::text, now())
FROM _tmp_ghost_rows
ON CONFLICT (initiative_id, budget_department) DO UPDATE SET
  q1 = public.initiative_budget_department_2026.q1 + EXCLUDED.q1,
  q2 = public.initiative_budget_department_2026.q2 + EXCLUDED.q2,
  q3 = public.initiative_budget_department_2026.q3 + EXCLUDED.q3,
  q4 = public.initiative_budget_department_2026.q4 + EXCLUDED.q4,
  is_in_pnl_it = public.initiative_budget_department_2026.is_in_pnl_it OR EXCLUDED.is_in_pnl_it,
  updated_at = timezone('utc'::text, now());

-- 5) Удаляем строки ghost-инициатив (CASCADE-связь только с initiative_id).
DELETE FROM public.initiative_budget_department_2026
WHERE initiative_id IN (SELECT ghost_id FROM _tmp_ghost_to_stub);

-- 6) Обнуляем quarterly_data.cost у ghost-инициатив (через ||, чтобы корректно создать ключи).
UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric)
         ),
    updated_at = timezone('utc'::text, now())
WHERE i.id IN (SELECT ghost_id FROM _tmp_ghost_to_stub);

-- 7) Пересинхронизируем quarterly_data.cost у стубов = сумма их строк initiative_budget_department_2026.
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
  WHERE initiative_id IN (SELECT DISTINCT stub_id FROM _tmp_ghost_to_stub)
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id;

-- Если стуб остался без строк (потому что от него ничего не пришло, и у самого ничего не было) —
-- его quarterly_data всё равно проставляем 0 (на случай если он был свежесозданный и в нём пусто).
UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric)
         ),
    updated_at = timezone('utc'::text, now())
WHERE i.id IN (SELECT DISTINCT stub_id FROM _tmp_ghost_to_stub)
  AND NOT EXISTS (SELECT 1 FROM public.initiative_budget_department_2026 b WHERE b.initiative_id = i.id);

\echo ''
\echo '── AFTER: total in DB (внутри транзакции) ────────────────────────────'
SELECT
  ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS split_total,
  ROUND(SUM(b.q1+b.q2+b.q3+b.q4) FILTER (WHERE b.is_in_pnl_it))::bigint AS split_pnl_it_total
FROM public.initiative_budget_department_2026 b;

\echo ''
\echo '── AFTER: примеры — стубы с обновлёнными суммами ─────────────────────'
SELECT s.unit, s.team, s.initiative,
       ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS y2026_cost
FROM public.initiatives s
JOIN public.initiative_budget_department_2026 b ON b.initiative_id = s.id
WHERE s.id IN (SELECT DISTINCT stub_id FROM _tmp_ghost_to_stub)
GROUP BY s.id, s.unit, s.team, s.initiative
ORDER BY s.unit, s.team;

\echo ''
\echo '── AFTER: примеры — Lolypop после переноса ───────────────────────────'
SELECT initiative, is_timeline_stub,
       ROUND(COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0)) AS y2026_cost
FROM public.initiatives
WHERE unit='App&Web' AND team='Lolypop'
ORDER BY is_timeline_stub DESC, y2026_cost DESC, initiative;

\echo ''
\echo '── AFTER: total quarterly_data.cost по всем инициативам ─────────────'
SELECT ROUND(SUM(
  COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
 +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
 +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
 +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0)
))::bigint AS quarterly_total
FROM public.initiatives;

ROLLBACK;
