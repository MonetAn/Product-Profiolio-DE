-- Diagnostic: где встречаются команды X-menu и X-men(u)
-- Запуск: scripts/db-psql.sh -f scripts/sql/diag_xmen_merge.sql

\echo '════════════════════════════════════════════════════════════════════'
\echo '1) initiatives — какие unit/team пары существуют'
\echo '════════════════════════════════════════════════════════════════════'
SELECT unit, team, COUNT(*) AS rows
FROM public.initiatives
WHERE team ILIKE 'X-men%' OR team ILIKE '%X-menu%'
GROUP BY unit, team ORDER BY unit, team;

\echo ''
\echo '2) people — кто числится в этих командах'
\echo '════════════════════════════════════════════════════════════════════'
SELECT unit, team, COUNT(*) AS rows
FROM public.people
WHERE team ILIKE 'X-men%' OR team ILIKE '%X-menu%'
GROUP BY unit, team ORDER BY unit, team;

\echo ''
\echo '3) team_quarter_snapshots'
\echo '════════════════════════════════════════════════════════════════════'
SELECT unit, team, quarter, array_length(person_ids, 1) AS people_count
FROM public.team_quarter_snapshots
WHERE team ILIKE 'X-men%' OR team ILIKE '%X-menu%'
ORDER BY unit, team, quarter;

\echo ''
\echo '4) team_effort_subgroups'
\echo '════════════════════════════════════════════════════════════════════'
SELECT s.unit, s.team, s.name, COUNT(m.person_id) AS members
FROM public.team_effort_subgroups s
LEFT JOIN public.team_effort_subgroup_members m ON m.subgroup_id=s.id
WHERE s.team ILIKE 'X-men%' OR s.team ILIKE '%X-menu%'
GROUP BY s.id, s.unit, s.team, s.name
ORDER BY s.unit, s.team, s.name;

\echo ''
\echo '5) sensitive_scopes'
\echo '════════════════════════════════════════════════════════════════════'
SELECT unit, team FROM public.sensitive_scopes
WHERE team ILIKE 'X-men%' OR team ILIKE '%X-menu%'
ORDER BY unit, team;

\echo ''
\echo '6) allowed_users.allowed_team_pairs / member_team / member_affiliations'
\echo '════════════════════════════════════════════════════════════════════'
SELECT email, role, member_unit, member_team,
       allowed_team_pairs::text AS pairs,
       member_affiliations::text AS affiliations
FROM public.allowed_users
WHERE member_team ILIKE 'X-men%' OR member_team ILIKE '%X-menu%'
   OR allowed_team_pairs::text ILIKE '%X-men%' OR allowed_team_pairs::text ILIKE '%X-menu%'
   OR member_affiliations::text ILIKE '%X-men%' OR member_affiliations::text ILIKE '%X-menu%';

\echo ''
\echo '7) Бюджет инициатив этих команд'
\echo '════════════════════════════════════════════════════════════════════'
SELECT i.unit, i.team, i.initiative,
       coalesce(b.budget_department,'—') AS budget_dept,
       coalesce(b.q1+b.q2+b.q3+b.q4,0) AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id=i.id
WHERE i.team ILIKE 'X-men%' OR i.team ILIKE '%X-menu%'
ORDER BY i.unit, i.team, i.initiative, budget_dept;

\echo ''
\echo '8) Конфликты: одна и та же инициатива в обеих командах?'
\echo '════════════════════════════════════════════════════════════════════'
WITH src AS (
  SELECT id, initiative, unit, team
  FROM public.initiatives
  WHERE team ILIKE 'X-men%' OR team ILIKE '%X-menu%'
)
SELECT initiative, unit, COUNT(*) AS occurrences,
       array_agg(team ORDER BY team) AS teams
FROM src
GROUP BY initiative, unit
HAVING COUNT(*) > 1
ORDER BY initiative;
