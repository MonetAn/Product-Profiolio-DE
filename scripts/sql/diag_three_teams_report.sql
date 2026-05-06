-- Детальный отчёт по трём командам (Drinkit/B2B IT Team, Drinkit/B2С IT Team, IT Drinkit/B2B)
-- Запуск: scripts/db-psql.sh -f scripts/sql/diag_three_teams_report.sql

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'A) ИНИЦИАТИВЫ С БЮДЖЕТОМ ПО КВАРТАЛАМ'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  i.unit                                        AS "Юнит",
  i.team                                        AS "Команда",
  i.initiative                                  AS "Инициатива",
  to_char(coalesce(b.q1, 0), 'FM999G999G999')   AS "Q1",
  to_char(coalesce(b.q2, 0), 'FM999G999G999')   AS "Q2",
  to_char(coalesce(b.q3, 0), 'FM999G999G999')   AS "Q3",
  to_char(coalesce(b.q4, 0), 'FM999G999G999')   AS "Q4",
  to_char(coalesce(b.q1+b.q2+b.q3+b.q4, 0),
          'FM999G999G999G999')                  AS "Итого",
  coalesce(b.budget_department, '—')            AS "Бюджет-департамент",
  i.id                                          AS "id"
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id = i.id
WHERE (i.unit='IT Drinkit') OR (i.unit='Drinkit' AND i.team IN ('B2B IT Team','B2С IT Team'))
ORDER BY i.unit, i.team, i.initiative;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'B) ИТОГИ ПО КОМАНДАМ'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  i.unit                                                          AS "Юнит",
  i.team                                                          AS "Команда",
  COUNT(DISTINCT i.id)                                            AS "Инициатив",
  to_char(coalesce(SUM(b.q1+b.q2+b.q3+b.q4), 0),
          'FM999G999G999G999')                                    AS "Бюджет всего"
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id = i.id
WHERE (i.unit='IT Drinkit') OR (i.unit='Drinkit' AND i.team IN ('B2B IT Team','B2С IT Team'))
GROUP BY i.unit, i.team
ORDER BY i.unit, i.team;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'C) РОСТЕР В team_quarter_snapshots (закреплённые люди по кварталам)'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  unit                                AS "Юнит",
  team                                AS "Команда",
  quarter                             AS "Квартал",
  array_length(person_ids, 1)         AS "Людей в ростере",
  roster_confirmed_at::date           AS "Подтверждён",
  roster_confirmed_by_name            AS "Кем"
FROM public.team_quarter_snapshots
WHERE (unit='IT Drinkit') OR (unit='Drinkit' AND team IN ('B2B IT Team','B2С IT Team'))
ORDER BY unit, team, quarter;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'D) ЛЮДИ, КОТОРЫЕ НАЗНАЧЕНЫ НА ИНИЦИАТИВЫ ЭТИХ КОМАНД'
\echo '   (через person_initiative_assignments — могут быть из ДРУГИХ команд)'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  i.unit                              AS "Юнит инициативы",
  i.team                              AS "Команда инициативы",
  i.initiative                        AS "Инициатива",
  p.full_name                         AS "ФИО",
  p.unit                              AS "Юнит человека",
  p.team                              AS "Команда человека",
  p.position                          AS "Должность"
FROM public.person_initiative_assignments pia
JOIN public.initiatives i ON i.id = pia.initiative_id
JOIN public.people p ON p.id = pia.person_id
WHERE (i.unit='IT Drinkit') OR (i.unit='Drinkit' AND i.team IN ('B2B IT Team','B2С IT Team'))
ORDER BY i.unit, i.team, i.initiative, p.full_name;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'E) ЛЮДИ, ЧИСЛЯЩИЕСЯ В САМИХ ЭТИХ КОМАНДАХ В people'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  unit                                AS "Юнит",
  team                                AS "Команда",
  full_name                           AS "ФИО",
  position                            AS "Должность",
  email                               AS "Email"
FROM public.people
WHERE (unit='IT Drinkit') OR (unit='Drinkit' AND team IN ('B2B IT Team','B2С IT Team'))
ORDER BY unit, team, full_name;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo 'F) ПОДГРУППЫ ВНУТРИ КОМАНД (team_effort_subgroups)'
\echo '════════════════════════════════════════════════════════════════════'
SELECT
  s.unit                              AS "Юнит",
  s.team                              AS "Команда",
  s.name                              AS "Подгруппа",
  COUNT(m.person_id)                  AS "Людей в подгруппе"
FROM public.team_effort_subgroups s
LEFT JOIN public.team_effort_subgroup_members m ON m.subgroup_id = s.id
WHERE (s.unit='IT Drinkit') OR (s.unit='Drinkit' AND s.team IN ('B2B IT Team','B2С IT Team'))
GROUP BY s.id, s.unit, s.team, s.name
ORDER BY s.unit, s.team, s.name;
