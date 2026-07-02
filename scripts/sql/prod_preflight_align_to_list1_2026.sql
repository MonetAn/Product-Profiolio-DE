-- =============================================================================
-- PROD: префлайт перед выравниванием cost 2026 к эталону LIST1 (team_budget_baseline_2026)
-- Только SELECT — безопасно запускать целиком.
--
-- Что делает основной фикс (отдельный файл):
--   scripts/sql/budget_2026_redistribute_all_teams_by_effort.sql
--   • cost = round(effort% / 100 × Tq) по кварталам из baseline
--   • остаток → один стаб «Не распределено»
--   • sum(cost) по команде = rub_all
--   • обновляет initiative_budget_department_2026
--
-- ВАЖНО: это НЕ «вернуть live как было до бага», а привести к эталону LIST1
-- по текущим % усилий. Команды с live > baseline (напр. загруженный ФОТ)
-- после фикса станут = baseline, не live.
--
-- Порядок на проде:
--   1) Этот файл (префлайт)
--   2) budget_2026_redistribute_all_teams_by_effort.sql с ROLLBACK → проверка «after»
--   3) Заменить ROLLBACK на COMMIT
-- =============================================================================

-- ── 1. Портфель: live vs LIST1 ───────────────────────────────────────────────
SELECT
  2111435636::bigint AS list1_all,
  (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS sum_baseline_teams,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS portfolio_live,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS portfolio_gap_vs_list1;

-- ── 2. Команды с расхождением live vs baseline (топ проблемных) ───────────────
SELECT
  b.unit,
  b.team,
  b.rub_all::bigint AS baseline_year,
  coalesce(t.live_year, 0)::bigint AS live_year,
  (coalesce(t.live_year, 0) - b.rub_all)::bigint AS live_minus_baseline,
  CASE
    WHEN coalesce(t.live_year, 0) > b.rub_all THEN 'live ВЫШЕ эталона — после фикса УМЕНЬШИТСЯ'
    WHEN coalesce(t.live_year, 0) < b.rub_all THEN 'live НИЖЕ эталона — после фикса ВЫРАСТЕТ'
    ELSE 'OK'
  END AS effect_of_fix
FROM public.team_budget_baseline_2026 b
LEFT JOIN (
  SELECT
    i.unit,
    i.team,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live_year
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE abs(coalesce(t.live_year, 0) - b.rub_all) > 1000
ORDER BY abs(coalesce(t.live_year, 0) - b.rub_all) DESC
LIMIT 50;

-- ── 3. Σ% усилий > 100% по кварталу (перед фиксом лучше поправить в админке) ─
WITH per_q AS (
  SELECT
    i.unit,
    i.team,
    q.quarter,
    sum(q.eff) AS sum_eff
  FROM public.initiatives i
  CROSS JOIN LATERAL (
    VALUES
      ('2026-Q1', coalesce((i.quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0)),
      ('2026-Q2', coalesce((i.quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0)),
      ('2026-Q3', coalesce((i.quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0)),
      ('2026-Q4', coalesce((i.quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0))
  ) AS q(quarter, eff)
  WHERE i.deleted_at IS NULL
    AND NOT coalesce(i.is_timeline_stub, false)
  GROUP BY i.unit, i.team, q.quarter
)
SELECT unit, team, quarter, round(sum_eff::numeric, 2) AS sum_eff_pct
FROM per_q
WHERE sum_eff > 100.01
ORDER BY sum_eff DESC, unit, team, quarter;

-- ── 4. Команды в baseline без ни одной инициативы в initiatives ─────────────
SELECT b.unit, b.team, b.rub_all::bigint
FROM public.team_budget_baseline_2026 b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL AND i.unit = b.unit AND i.team = b.team
)
ORDER BY b.unit, b.team;

-- ── 5. Примеры для ручной проверки после фикса ───────────────────────────────
-- IT HR
SELECT
  'IT HR' AS sample,
  b.rub_all::bigint AS baseline_year,
  t.live_year,
  (t.live_year - b.rub_all::bigint) AS gap
FROM public.team_budget_baseline_2026 b
JOIN (
  SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint AS live_year
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'IT HR' AND team = 'IT HR'
) t ON true
WHERE b.unit = 'IT HR' AND b.team = 'IT HR';

-- App&Web / m0rder (типичный live >> baseline)
SELECT
  'm0rder' AS sample,
  b.rub_all::bigint AS baseline_year,
  t.live_year,
  (t.live_year - b.rub_all::bigint) AS gap
FROM public.team_budget_baseline_2026 b
JOIN (
  SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint AS live_year
  FROM public.initiatives
  WHERE deleted_at IS NULL AND unit = 'App&Web' AND team ILIKE '%order%'
) t ON true
WHERE b.unit = 'App&Web' AND b.team ILIKE '%order%';
