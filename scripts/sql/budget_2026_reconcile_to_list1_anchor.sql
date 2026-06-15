-- Выровнять sum(initiatives.quarterly cost 2026) под эталон LIST1:
--   2 111 435 636 ₽ (все)  /  2 038 870 010 ₽ (PnL IT)
-- Якоря: budget_portfolio_anchor_2026, суммы команд: team_budget_baseline_2026.
--
-- Когда использовать: после удалений в админке, когда «тотал» не сходится с эталоном
-- (типичные дыры: Frontend Guild, Pilorama, Infrastructure — см. diag_gap_2111_vs_live.sql).
--
-- Порядок: Run целиком → проверить блок «После» → COMMIT или ROLLBACK.

BEGIN;

-- --- До ---
SELECT
  2111435636::bigint AS list1_all,
  2038870010::bigint AS list1_pnl_it,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS sum_quarterly_before,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS gap_before;

-- otherCosts 2026 = 0
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

-- Команды без baseline → cost 2026 = 0
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

-- Масштаб cost по каждой команде до team_budget_baseline_2026.rub_all
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

-- --- После ---
SELECT
  2111435636::bigint AS list1_all,
  2038870010::bigint AS list1_pnl_it,
  (SELECT truth_total_rub FROM public.budget_portfolio_anchor_2026 WHERE id = 1) AS anchor_all,
  (SELECT sum(rub_all) FROM public.team_budget_baseline_2026) AS sum_baseline_all,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS sum_quarterly_after,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE deleted_at IS NULL
  ) AS gap_after;

SELECT b.unit, b.team, b.rub_all AS baseline_year,
  coalesce(t.live_year, 0)::bigint AS live_year_after,
  (b.rub_all - coalesce(t.live_year, 0))::bigint AS gap
FROM public.team_budget_baseline_2026 b
LEFT JOIN (
  SELECT i.unit, i.team,
    sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ) AS live_year
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE abs(b.rub_all - coalesce(t.live_year, 0)) > 1000
ORDER BY abs(b.rub_all - coalesce(t.live_year, 0)) DESC
LIMIT 20;

-- После проверки «После»: раскомментируйте COMMIT и закомментируйте ROLLBACK.
-- COMMIT;
ROLLBACK;
