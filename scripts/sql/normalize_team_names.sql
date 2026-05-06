-- Нормализация регистра в названиях команд:
--   1) Tech Platform/Engineering Tools (Capital T) → Engineering tools (lowercase t)
--      Старый пустой стуб "Стоимость команды 2025" (cost=0) удаляем — он легаси-имя
--      и пустой; единственным стубом команды останется "Стоимость команды Engineering Tools 2026"
--      (созданный мной при ghost-cleanup, с cost=1 065 984).
--   2) Data Office/AI LAb → AI Lab. Имя стуба тоже выравниваем.
--
-- Применение (preview): scripts/db-psql.sh -f scripts/sql/normalize_team_names.sql
-- Применение (запись):  замени ROLLBACK на COMMIT в конце.

\set ON_ERROR_STOP on

\echo '── BEFORE ──────────────────────────────────────────────────────────'
SELECT unit, team, COUNT(*) AS n_inits,
       ROUND(SUM(COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0))) AS y2026_cost
FROM public.initiatives
WHERE team IN ('Engineering Tools','Engineering tools','AI LAb','AI Lab')
GROUP BY unit, team
ORDER BY unit, team;

BEGIN;

-- 1) Engineering Tools → Engineering tools.
UPDATE public.initiatives
SET team = 'Engineering tools', updated_at = timezone('utc'::text, now())
WHERE unit = 'Tech Platform' AND team = 'Engineering Tools';

-- Удаляем старый пустой стуб "Стоимость команды 2025"; основной стуб команды теперь
-- "Стоимость команды Engineering Tools 2026" (сохраняет имя для трассируемости).
DELETE FROM public.initiatives
WHERE unit = 'Tech Platform' AND team = 'Engineering tools'
  AND initiative = 'Стоимость команды 2025'
  AND COALESCE(is_timeline_stub, false) = true
  AND id NOT IN (
    SELECT initiative_id FROM public.initiative_budget_department_2026
  );

-- 2) AI LAb → AI Lab.
UPDATE public.initiatives
SET team = 'AI Lab', updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office' AND team = 'AI LAb';

-- Имя стуба «Стоимость команды AI LAb 2026» → «Стоимость команды AI Lab 2026».
UPDATE public.initiatives
SET initiative = 'Стоимость команды AI Lab 2026', updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office' AND team = 'AI Lab'
  AND initiative = 'Стоимость команды AI LAb 2026'
  AND is_timeline_stub = true;

\echo ''
\echo '── AFTER (внутри транзакции) ───────────────────────────────────────'
SELECT unit, team, COUNT(*) AS n_inits,
       ROUND(SUM(COALESCE((quarterly_data->'2026-Q1'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q2'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q3'->>'cost')::numeric,0)
               +COALESCE((quarterly_data->'2026-Q4'->>'cost')::numeric,0))) AS y2026_cost
FROM public.initiatives
WHERE team IN ('Engineering Tools','Engineering tools','AI LAb','AI Lab')
GROUP BY unit, team
ORDER BY unit, team;

\echo ''
\echo '── AFTER: total в БД (должен совпасть с CSV truth_total) ───────────'
SELECT 2111435636 AS truth_csv,
       ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS split_total,
       ROUND(SUM(
         COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
        +COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
        +COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
        +COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0)
       ))::bigint AS quarterly_total
FROM public.initiative_budget_department_2026 b
CROSS JOIN public.initiatives i
LIMIT 1;

\echo ''
\echo '── AFTER: список инициатив в обновлённых командах ──────────────────'
SELECT unit, team, initiative, is_timeline_stub
FROM public.initiatives
WHERE (unit = 'Tech Platform' AND team = 'Engineering tools')
   OR (unit = 'Data Office' AND team = 'AI Lab')
ORDER BY unit, team, is_timeline_stub DESC, initiative;

ROLLBACK;
