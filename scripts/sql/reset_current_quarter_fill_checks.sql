-- Сбросить «галочки заполнения» в текущем квартале по всем командам.
--
-- Что сбрасываем:
-- 1) portfolio_hub_block_acks (coefficients/descriptions/planFact/geo)
-- 2) team_quarter_snapshots.roster_confirmed_*
--
-- Preview: scripts/db-psql.sh -f scripts/sql/reset_current_quarter_fill_checks.sql
-- Commit:  замените ROLLBACK на COMMIT внизу.

\set ON_ERROR_STOP on

WITH q AS (
  SELECT to_char(now(),'YYYY') || '-Q' || EXTRACT(quarter FROM now())::int AS current_q
)
SELECT current_q AS quarter FROM q;

\echo ''
\echo '--- BEFORE ---'
WITH q AS (
  SELECT to_char(now(),'YYYY') || '-Q' || EXTRACT(quarter FROM now())::int AS current_q
)
SELECT
  (SELECT COUNT(*) FROM public.portfolio_hub_block_acks a WHERE a.quarter = q.current_q) AS hub_acks,
  (SELECT COUNT(*) FROM public.team_quarter_snapshots s WHERE s.quarter = q.current_q AND s.roster_confirmed_at IS NOT NULL) AS roster_confirmed
FROM q;

BEGIN;

WITH q AS (
  SELECT to_char(now(),'YYYY') || '-Q' || EXTRACT(quarter FROM now())::int AS current_q
)
DELETE FROM public.portfolio_hub_block_acks a
USING q
WHERE a.quarter = q.current_q;

WITH q AS (
  SELECT to_char(now(),'YYYY') || '-Q' || EXTRACT(quarter FROM now())::int AS current_q
)
UPDATE public.team_quarter_snapshots s
SET roster_confirmed_at = NULL,
    roster_confirmed_by = NULL,
    roster_confirmed_by_name = NULL
FROM q
WHERE s.quarter = q.current_q
  AND s.roster_confirmed_at IS NOT NULL;

\echo ''
\echo '--- AFTER (inside transaction) ---'
WITH q AS (
  SELECT to_char(now(),'YYYY') || '-Q' || EXTRACT(quarter FROM now())::int AS current_q
)
SELECT
  (SELECT COUNT(*) FROM public.portfolio_hub_block_acks a WHERE a.quarter = q.current_q) AS hub_acks,
  (SELECT COUNT(*) FROM public.team_quarter_snapshots s WHERE s.quarter = q.current_q AND s.roster_confirmed_at IS NOT NULL) AS roster_confirmed
FROM q;

COMMIT;
