-- Diagnostic: бюджет Codo + список всех инициатив FAP

\echo '=== БЮДЖЕТ Codo по budget_department ==='
SELECT budget_department,
       to_char(q1,'FM999G999G999') AS q1,
       to_char(q2,'FM999G999G999') AS q2,
       to_char(q3,'FM999G999G999') AS q3,
       to_char(q4,'FM999G999G999') AS q4,
       to_char(q1+q2+q3+q4,'FM999G999G999G999') AS total
FROM public.initiative_budget_department_2026
WHERE initiative_id='3660c78b-11ff-4d08-8eec-09dda82036dd'
ORDER BY budget_department;

\echo ''
\echo '=== ВСЕ инициативы FAP ==='
SELECT i.team, i.initiative,
       coalesce(b.budget_department,'—') AS dept,
       to_char(coalesce(b.q1+b.q2+b.q3+b.q4,0),'FM999G999G999G999') AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id=i.id
WHERE i.unit='FAP'
ORDER BY i.team, i.initiative, dept;

\echo ''
\echo '=== СВОДКА по командам внутри FAP ==='
SELECT i.team, COUNT(DISTINCT i.id) AS initiatives,
       to_char(SUM(coalesce(b.q1+b.q2+b.q3+b.q4,0)),'FM999G999G999G999') AS total
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id=i.id
WHERE i.unit='FAP'
GROUP BY i.team
ORDER BY i.team;

\echo ''
\echo '=== Сколько инициатив FAP БЕЗ Codo по budget_department ==='
SELECT b.budget_department, COUNT(DISTINCT i.id) AS recipients_count
FROM public.initiatives i
JOIN public.initiative_budget_department_2026 b ON b.initiative_id=i.id
WHERE i.unit='FAP' AND i.id <> '3660c78b-11ff-4d08-8eec-09dda82036dd'
GROUP BY b.budget_department
ORDER BY b.budget_department;
