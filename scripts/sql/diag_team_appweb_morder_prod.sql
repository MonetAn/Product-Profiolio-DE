-- App&Web / mOrder vs m0rder — найти реальное имя и сравнить live vs baseline
-- Только SELECT. Run целиком.

-- ── A) Как команда записана в разных таблицах ─────────────────────────────
SELECT 'baseline' AS src, team, rub_all::bigint
FROM public.team_budget_baseline_2026
WHERE unit = 'App&Web' AND team ILIKE '%order%'
UNION ALL
SELECT 'initiatives', team, count(*)::bigint
FROM public.initiatives
WHERE deleted_at IS NULL AND unit = 'App&Web' AND team ILIKE '%order%'
GROUP BY team
ORDER BY src, team;

-- ── B) Сводка (подставляется team из initiatives — обычно m0rder на prod) ─
WITH team_name AS (
  SELECT DISTINCT team
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'App&Web' AND team ILIKE '%order%'
  LIMIT 1
),
live AS (
  SELECT
    i.team,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)))::bigint AS q1,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)))::bigint AS q2,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)))::bigint AS q3,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)))::bigint AS q4,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS year,
    count(*) FILTER (WHERE NOT COALESCE(i.is_timeline_stub, false)) AS initiatives,
    count(*) FILTER (WHERE COALESCE(i.is_timeline_stub, false)) AS stubs
  FROM public.initiatives i
  INNER JOIN team_name t ON i.team = t.team
  WHERE i.deleted_at IS NULL AND i.unit = 'App&Web'
  GROUP BY i.team
),
eff AS (
  SELECT
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0)), 1) AS eff_q1,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0)), 1) AS eff_q2,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0)), 1) AS eff_q3,
    round(sum(COALESCE((i.quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0)), 1) AS eff_q4
  FROM public.initiatives i
  INNER JOIN team_name t ON i.team = t.team
  WHERE i.deleted_at IS NULL AND i.unit = 'App&Web'
    AND NOT COALESCE(i.is_timeline_stub, false)
)
SELECT
  l.team AS initiative_team_name,
  b.team AS baseline_team_name,
  CASE WHEN b.team IS NULL THEN 'НЕТ baseline — delete использует frozen/live, не LIST1'
       WHEN l.team <> b.team THEN 'РАЗНОЕ НАПИСАНИЕ unit+team в baseline vs initiatives'
       ELSE 'имена совпадают' END AS name_match,
  b.rub_all::bigint AS baseline_year,
  l.year AS live_year,
  (l.year - coalesce(b.rub_all, 0)::bigint) AS gap_year,
  b.q1::bigint AS b_q1, l.q1 AS live_q1, (l.q1 - coalesce(b.q1, 0)::bigint) AS gap_q1,
  b.q2::bigint AS b_q2, l.q2 AS live_q2, (l.q2 - coalesce(b.q2, 0)::bigint) AS gap_q2,
  b.q3::bigint AS b_q3, l.q3 AS live_q3, (l.q3 - coalesce(b.q3, 0)::bigint) AS gap_q3,
  b.q4::bigint AS b_q4, l.q4 AS live_q4, (l.q4 - coalesce(b.q4, 0)::bigint) AS gap_q4,
  l.initiatives, l.stubs,
  e.eff_q1, e.eff_q2, e.eff_q3, e.eff_q4,
  CASE
    WHEN b.rub_all IS NULL THEN 'baseline отсутствует'
    WHEN l.year = b.rub_all::bigint THEN 'OK: delete к baseline не сдвинет (если live=frozen)'
    WHEN l.year < b.rub_all::bigint THEN 'DELETE ПОДНИМЕТ на ' || (b.rub_all::bigint - l.year)::text
    ELSE 'DELETE ОПУСТИТ на ' || (l.year - b.rub_all::bigint)::text
  END AS delete_effect
FROM live l
LEFT JOIN public.team_budget_baseline_2026 b
  ON b.unit = 'App&Web' AND b.team ILIKE '%order%'
CROSS JOIN eff e;
