-- Выровнять initiatives.quarterly_data (2026) под team_budget_baseline_2026.
-- 0) otherCosts 2026 = 0  ·  1) сироты cost=0  ·  2–3) масштаб cost по командам до rub_all
--
-- Порядок в проде:
--   0) list1-apply + ensure_fap_codo_stub
--   1) budget_2026_reapply_costs_from_baselines_COMMIT.sql  ← пишет cost (в т.ч. FAP/Codo)
--   2) Этот файл → COMMIT (масштаб команд; не создаёт cost с нуля)
--   3) budget_2026_sync_split_from_quarterly.sql → COMMIT
--
-- Отдельный budget_2026_zero_other_costs_2026.sql не нужен, если гоняете этот файл.

BEGIN;

-- 0) otherCosts 2026 = 0 (эталон LIST1 = cost / ФОТ)
UPDATE public.initiatives i
SET
  quarterly_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,otherCosts}', '0'::jsonb, true),
        '{2026-Q2,otherCosts}', '0'::jsonb, true
      ),
      '{2026-Q3,otherCosts}', '0'::jsonb, true
    ),
    '{2026-Q4,otherCosts}', '0'::jsonb, true
  ),
  updated_at = timezone('utc'::text, now())
WHERE i.deleted_at IS NULL;

-- 1) Сироты: нет в baseline → cost 2026 = 0
UPDATE public.initiatives i
SET
  quarterly_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,cost}', '0'::jsonb, true),
        '{2026-Q2,cost}', '0'::jsonb, true
      ),
      '{2026-Q3,cost}', '0'::jsonb, true
    ),
    '{2026-Q4,cost}', '0'::jsonb, true
  ),
  updated_at = timezone('utc'::text, now())
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 b
    WHERE b.unit = i.unit AND b.team = i.team
  );

-- 2–3) Масштаб cost по кварталам до team_budget_baseline_2026.rub_all
-- (без TEMP TABLE: в SQL Editor по частям temp-таблица пропадает → 42P01)
DO $$
DECLARE
  r record;
  q text;
  qd jsonb;
  c numeric;
BEGIN
  FOR r IN
    WITH team_year AS (
      SELECT
        i.unit,
        i.team,
        sum(
          COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
        ) AS live_year
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
      GROUP BY i.unit, i.team
    ),
    team_scale AS (
      SELECT
        b.unit,
        b.team,
        CASE
          WHEN coalesce(t.live_year, 0) <= 0 THEN 1::numeric
          ELSE b.rub_all::numeric / t.live_year
        END AS scale_f
      FROM public.team_budget_baseline_2026 b
      LEFT JOIN team_year t ON t.unit = b.unit AND t.team = b.team
    )
    SELECT i.id, s.scale_f
    FROM public.initiatives i
    INNER JOIN team_scale s ON s.unit = i.unit AND s.team = i.team
    WHERE i.deleted_at IS NULL
      AND abs(s.scale_f - 1) > 0.000001
  LOOP
    SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = r.id;
    FOREACH q IN ARRAY ARRAY['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] LOOP
      c := round(COALESCE((qd #>> ARRAY[q, 'cost'])::numeric, 0) * r.scale_f);
      qd := jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(qd, '{}'::jsonb), ARRAY[q, 'cost'], to_jsonb(c), true),
          ARRAY[q, 'otherCosts'], '0'::jsonb, true
        ),
        ARRAY[q, 'costFinanceConfirmed'], 'true'::jsonb, true
      );
    END LOOP;
    UPDATE public.initiatives
    SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Контроль (UI = cost + otherCosts, otherCosts должны быть 0)
SELECT
  (SELECT truth_total_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_all,
  (SELECT truth_pnl_it_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_pnl,
  (SELECT sum(rub_all) FROM public.team_budget_baseline_2026) AS sum_baseline,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q1,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,otherCosts}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS sum_quarterly_ui,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,otherCosts}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,otherCosts}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS sum_other_costs_2026;

SELECT count(*)::int AS orphan_teams_zeroed
FROM public.initiatives i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 b
    WHERE b.unit = i.unit AND b.team = i.team
  );

-- ROLLBACK;
COMMIT;
