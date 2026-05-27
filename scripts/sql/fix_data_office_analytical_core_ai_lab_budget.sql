-- =============================================================================
-- Data Office: развести Analytical Core (40 165 895) и AI Lab (53 545 608).
--
-- Supabase SQL Editor: вставьте весь файл и Run (без команд psql \set / \echo).
-- Терминал: scripts/db-psql.sh -f scripts/sql/fix_data_office_analytical_core_ai_lab_budget.sql
--
-- Preview: в конце ROLLBACK. Запись: замените на COMMIT.
-- После COMMIT (опционально): budget_2026_sync_split_from_quarterly.sql
-- =============================================================================

-- ── BEFORE: команды ─────────────────────────────────────────────────
SELECT team,
       count(*) FILTER (WHERE NOT coalesce(is_timeline_stub, false)) AS live_n,
       count(*) FILTER (WHERE coalesce(is_timeline_stub, false)) AS stub_n,
       round(sum(
         coalesce((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
       ))::bigint AS y2026
FROM public.initiatives
WHERE unit = 'Data Office'
  AND team IN ('Analytical Core', 'AI Lab')
  AND deleted_at IS NULL
GROUP BY team
ORDER BY team;

BEGIN;

-- ── 1) Analytical Core: обнулить все live-инициативы ───────────────────
UPDATE public.initiatives i
SET
  quarterly_data =
    coalesce(i.quarterly_data, '{}'::jsonb)
    || jsonb_build_object(
         '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0)
       ),
  updated_at = timezone('utc'::text, now())
WHERE i.unit = 'Data Office'
  AND i.team = 'Analytical Core'
  AND i.deleted_at IS NULL
  AND coalesce(i.is_timeline_stub, false) = false;

-- ── 2) Analytical Core: стуб 40 165 895 ───────────────────────────────
UPDATE public.initiatives i
SET
  quarterly_data =
    coalesce(i.quarterly_data, '{}'::jsonb)
    || jsonb_build_object(
         '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 8992646::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 10072691::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 10517875::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 10582683::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0)
       ),
  updated_at = timezone('utc'::text, now())
WHERE i.unit = 'Data Office'
  AND i.team = 'Analytical Core'
  AND i.initiative = 'Стоимость команды кор команды'
  AND coalesce(i.is_timeline_stub, false) = true
  AND i.deleted_at IS NULL;

-- ── 3) AI Lab: стуб = 0 ───────────────────────────────────────────────
UPDATE public.initiatives i
SET
  quarterly_data =
    coalesce(i.quarterly_data, '{}'::jsonb)
    || jsonb_build_object(
         '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0),
         '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', 0::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', 0)
       ),
  updated_at = timezone('utc'::text, now())
WHERE i.unit = 'Data Office'
  AND i.team = 'AI Lab'
  AND i.initiative = 'Стоимость команды AI Lab 2026'
  AND coalesce(i.is_timeline_stub, false) = true
  AND i.deleted_at IS NULL;

-- ── 4) AI Lab: live-инициативы (cost + effortCoefficient)
--     Без TEMP TABLE — Supabase SQL Editor выполняет запросы по одному.
UPDATE public.initiatives i
SET
  quarterly_data =
    coalesce(i.quarterly_data, '{}'::jsonb)
    || jsonb_build_object(
         '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', t.q1::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', t.e1),
         '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', t.q2::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', t.e2),
         '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', t.q3::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', t.e3),
         '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', t.q4::numeric, 'otherCosts', 0::numeric, 'effortCoefficient', t.e4)
       ),
  updated_at = timezone('utc'::text, now())
FROM (
  VALUES
    ('Автографики'::text, 3621608::bigint, 4321046::bigint, 4117689::bigint, 4119564::bigint, 30::int, 30::int, 30::int, 30::int),
    ('Автоматическая оценка дефектов в отчетах контроллинга', 1984661, 2330311, 2226593, 2230570, 17, 16, 16, 16),
    ('Умный трекинг AI', 5592652, 6964076, 6666028, 6642086, 47, 49, 49, 49),
    ('Умный учет', 347710, 339577, 335498, 341577, 3, 2, 2, 2),
    ('ЦО 3.0', 347710, 339577, 335498, 341577, 3, 3, 3, 3)
) AS t(initiative, q1, q2, q3, q4, e1, e2, e3, e4)
WHERE i.unit = 'Data Office'
  AND i.team = 'AI Lab'
  AND i.initiative = t.initiative
  AND coalesce(i.is_timeline_stub, false) = false
  AND i.deleted_at IS NULL;

-- ── 5) Эталон команд ──────────────────────────────────────────────────
INSERT INTO public.team_budget_baseline_2026 (unit, team, q1, q2, q3, q4, rub_all, rub_pnl_it, frozen_at)
VALUES
  ('Data Office', 'Analytical Core', 8992646, 10072691, 10517875, 10582683, 40165895, 40165895, timezone('utc'::text, now())),
  ('Data Office', 'AI Lab', 11899341, 14290587, 13682306, 13666374, 53545608, 53545608, timezone('utc'::text, now()))
ON CONFLICT (unit, team) DO UPDATE SET
  q1 = excluded.q1,
  q2 = excluded.q2,
  q3 = excluded.q3,
  q4 = excluded.q4,
  rub_all = excluded.rub_all,
  rub_pnl_it = excluded.rub_pnl_it,
  frozen_at = excluded.frozen_at;

-- ── AFTER: команды (ожидание AC 40165895, AI Lab 53545608) ────────────
SELECT team,
       round(sum(
         coalesce((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
       ))::bigint AS y2026
FROM public.initiatives
WHERE unit = 'Data Office'
  AND team IN ('Analytical Core', 'AI Lab')
  AND deleted_at IS NULL
GROUP BY team
ORDER BY team;

-- ── AFTER: AI Lab детализация ─────────────────────────────────────────
SELECT initiative,
       round(coalesce((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)) AS q1_cost,
       (quarterly_data->'2026-Q1'->>'effortCoefficient')::int AS q1_eff,
       round(coalesce((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)) AS q2_cost,
       (quarterly_data->'2026-Q2'->>'effortCoefficient')::int AS q2_eff,
       round(coalesce((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)) AS q3_cost,
       (quarterly_data->'2026-Q3'->>'effortCoefficient')::int AS q3_eff,
       round(coalesce((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)) AS q4_cost,
       (quarterly_data->'2026-Q4'->>'effortCoefficient')::int AS q4_eff,
       round(
         coalesce((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
         + coalesce((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
       )::bigint AS y2026
FROM public.initiatives
WHERE unit = 'Data Office' AND team = 'AI Lab' AND deleted_at IS NULL
ORDER BY is_timeline_stub DESC, initiative;

-- ── AFTER: Σ effort AI Lab (ожидание 100) ─────────────────────────────
SELECT
  sum((quarterly_data->'2026-Q1'->>'effortCoefficient')::int) FILTER (WHERE NOT coalesce(is_timeline_stub, false)) AS sum_eff_q1,
  sum((quarterly_data->'2026-Q2'->>'effortCoefficient')::int) FILTER (WHERE NOT coalesce(is_timeline_stub, false)) AS sum_eff_q2,
  sum((quarterly_data->'2026-Q3'->>'effortCoefficient')::int) FILTER (WHERE NOT coalesce(is_timeline_stub, false)) AS sum_eff_q3,
  sum((quarterly_data->'2026-Q4'->>'effortCoefficient')::int) FILTER (WHERE NOT coalesce(is_timeline_stub, false)) AS sum_eff_q4
FROM public.initiatives
WHERE unit = 'Data Office' AND team = 'AI Lab' AND deleted_at IS NULL;

-- ── Контроль: total Data Office ───────────────────────────────────────
SELECT round(sum(
  coalesce((quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
  + coalesce((quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
  + coalesce((quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
  + coalesce((quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
))::bigint AS data_office_total
FROM public.initiatives
WHERE unit = 'Data Office' AND deleted_at IS NULL;

ROLLBACK;
-- COMMIT;
