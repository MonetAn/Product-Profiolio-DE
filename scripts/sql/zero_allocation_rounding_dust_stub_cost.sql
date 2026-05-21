-- Обнулить «пыль» округления (1..99 ₽) в quarterly_data.cost у заглушек команд.
-- Соответствует ALLOCATION_ROUNDING_DUST_RUB = 100 в src/lib/adminDataManager.ts.
--
-- Preview: scripts/db-psql.sh -f scripts/sql/zero_allocation_rounding_dust_stub_cost.sql
-- Commit:  замените ROLLBACK на COMMIT внизу.

\set ON_ERROR_STOP on

\echo ''
\echo '--- DUST ROWS (preview, will be zeroed) ---'
SELECT
  i.id,
  i.unit,
  i.team,
  i.initiative,
  e.quarter_key,
  e.cost::numeric AS cost_rub
FROM public.initiatives i
CROSS JOIN LATERAL (
  SELECT key AS quarter_key,
         COALESCE((i.quarterly_data -> key ->> 'cost')::numeric, 0) AS cost
  FROM jsonb_object_keys(COALESCE(i.quarterly_data, '{}'::jsonb)) AS key
  WHERE key ~ '^\d{4}-Q[1-4]$'
) e
WHERE COALESCE(i.is_timeline_stub, false) = true
  AND e.cost > 0
  AND e.cost < 100
ORDER BY i.team, i.initiative, e.quarter_key;

\echo ''
\echo '--- SUMMARY ---'
SELECT
  COUNT(*) AS dust_cells,
  COUNT(DISTINCT i.id) AS stub_initiatives
FROM public.initiatives i
CROSS JOIN LATERAL (
  SELECT COALESCE((i.quarterly_data -> key ->> 'cost')::numeric, 0) AS cost
  FROM jsonb_object_keys(COALESCE(i.quarterly_data, '{}'::jsonb)) AS key
  WHERE key ~ '^\d{4}-Q[1-4]$'
) e
WHERE COALESCE(i.is_timeline_stub, false) = true
  AND e.cost > 0
  AND e.cost < 100;

BEGIN;

UPDATE public.initiatives i
SET quarterly_data = patched.new_qd,
    updated_at = timezone('utc'::text, now())
FROM (
  SELECT
    s.id,
    (
      SELECT COALESCE(jsonb_object_agg(kv.key, kv.val), '{}'::jsonb)
      FROM (
        SELECT
          k AS key,
          CASE
            WHEN k ~ '^\d{4}-Q[1-4]$'
              AND COALESCE((s.qd -> k ->> 'cost')::numeric, 0) > 0
              AND COALESCE((s.qd -> k ->> 'cost')::numeric, 0) < 100
            THEN COALESCE(s.qd -> k, '{}'::jsonb) || jsonb_build_object('cost', 0)
            ELSE s.qd -> k
          END AS val
        FROM jsonb_object_keys(COALESCE(s.qd, '{}'::jsonb)) AS k
      ) kv
    ) AS new_qd
  FROM (
    SELECT id, quarterly_data AS qd
    FROM public.initiatives
    WHERE COALESCE(is_timeline_stub, false) = true
  ) s
) patched
WHERE i.id = patched.id
  AND i.quarterly_data IS DISTINCT FROM patched.new_qd;

\echo ''
\echo '--- AFTER (remaining dust on stubs, expect 0 rows) ---'
SELECT
  i.id,
  i.team,
  e.quarter_key,
  e.cost::numeric AS cost_rub
FROM public.initiatives i
CROSS JOIN LATERAL (
  SELECT key AS quarter_key,
         COALESCE((i.quarterly_data -> key ->> 'cost')::numeric, 0) AS cost
  FROM jsonb_object_keys(COALESCE(i.quarterly_data, '{}'::jsonb)) AS key
  WHERE key ~ '^\d{4}-Q[1-4]$'
) e
WHERE COALESCE(i.is_timeline_stub, false) = true
  AND e.cost > 0
  AND e.cost < 100
ORDER BY i.team, e.quarter_key;

ROLLBACK;
-- COMMIT;
