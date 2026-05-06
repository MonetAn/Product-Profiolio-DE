-- Diagnostic: текущая раскладка по IT Drinkit / B2B IT Team / Drinkit
-- Запуск: scripts/db-psql.sh -f scripts/sql/diag_it_drinkit_b2b.sql

\echo '============================================================'
\echo '1) initiatives — где встречается IT Drinkit и B2B IT Team'
\echo '============================================================'
SELECT unit, team, COUNT(*) AS rows
FROM public.initiatives
WHERE unit IN ('IT Drinkit', 'Drinkit') OR team IN ('B2B IT Team', 'IT Drinkit')
GROUP BY unit, team
ORDER BY unit, team;

\echo ''
\echo '2) people — кто числится в этих юнитах/командах'
\echo '============================================================'
SELECT unit, team, COUNT(*) AS rows
FROM public.people
WHERE unit IN ('IT Drinkit', 'Drinkit') OR team IN ('B2B IT Team', 'IT Drinkit')
GROUP BY unit, team
ORDER BY unit, team;

\echo ''
\echo '3) team_quarter_snapshots — снимки ростера'
\echo '============================================================'
SELECT unit, team, quarter, array_length(person_ids, 1) AS people_count
FROM public.team_quarter_snapshots
WHERE unit IN ('IT Drinkit', 'Drinkit') OR team IN ('B2B IT Team', 'IT Drinkit')
ORDER BY unit, team, quarter;

\echo ''
\echo '4) team_effort_subgroups — подгруппы внутри команд'
\echo '============================================================'
SELECT unit, team, name, COUNT(*) OVER (PARTITION BY unit, team) AS subgroups_in_team
FROM public.team_effort_subgroups
WHERE unit IN ('IT Drinkit', 'Drinkit') OR team IN ('B2B IT Team', 'IT Drinkit')
ORDER BY unit, team, name;

\echo ''
\echo '5) sensitive_scopes — скрытые скоупы'
\echo '============================================================'
SELECT unit, team
FROM public.sensitive_scopes
WHERE unit IN ('IT Drinkit', 'Drinkit') OR team IN ('B2B IT Team', 'IT Drinkit')
ORDER BY unit, team;

\echo ''
\echo '6) allowed_users.allowed_units — IT Drinkit как unit-доступ'
\echo '============================================================'
SELECT email, role, allowed_units
FROM public.allowed_users
WHERE 'IT Drinkit' = ANY(allowed_units) OR 'Drinkit' = ANY(allowed_units);

\echo ''
\echo '7) allowed_users.allowed_team_pairs — пары unit/team в доступах'
\echo '============================================================'
SELECT email, role, allowed_team_pairs
FROM public.allowed_users
WHERE allowed_team_pairs::text ILIKE '%IT Drinkit%' OR allowed_team_pairs::text ILIKE '%B2B IT Team%';

\echo ''
\echo '8) allowed_users.member_unit / member_team / member_affiliations'
\echo '============================================================'
SELECT email, member_unit, member_team, member_affiliations
FROM public.allowed_users
WHERE member_unit IN ('IT Drinkit', 'Drinkit')
   OR member_team IN ('B2B IT Team', 'IT Drinkit')
   OR member_affiliations::text ILIKE '%IT Drinkit%'
   OR member_affiliations::text ILIKE '%B2B IT Team%';

\echo ''
\echo '9) Конфликты: пересечения IT Drinkit и Drinkit/B2B IT Team в инициативах'
\echo '============================================================'
WITH src AS (
  SELECT id, initiative, unit, team
  FROM public.initiatives
  WHERE (unit = 'IT Drinkit') OR (unit = 'Drinkit' AND team = 'B2B IT Team')
)
SELECT initiative, COUNT(*) AS occurrences, array_agg(unit||' / '||team) AS placements
FROM src
GROUP BY initiative
HAVING COUNT(*) > 1
ORDER BY initiative;
