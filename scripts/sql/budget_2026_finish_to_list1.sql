-- Финиш до LIST1: 2111435636 (все) / 2038870010 (PnL IT).
-- Run целиком (Ctrl+A). COMMIT в конце.

BEGIN;

-- 1) FAP/Codo: cost в заглушку (дыра ~536k после reapply)
UPDATE public.initiatives i
SET
  quarterly_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(i.quarterly_data, '{}'::jsonb),
          '{2026-Q1}',
          jsonb_build_object(
            'cost', b.q1, 'otherCosts', 0, 'costFinanceConfirmed', true,
            'comment', '', 'onTrack', true, 'support', false,
            'metricFact', '', 'metricPlan', '', 'effortCoefficient', 0
          ),
          true
        ),
        '{2026-Q2}',
        jsonb_build_object(
          'cost', b.q2, 'otherCosts', 0, 'costFinanceConfirmed', true,
          'comment', '', 'onTrack', true, 'support', false,
          'metricFact', '', 'metricPlan', '', 'effortCoefficient', 0
        ),
        true
      ),
      '{2026-Q3}',
      jsonb_build_object(
        'cost', b.q3, 'otherCosts', 0, 'costFinanceConfirmed', true,
        'comment', '', 'onTrack', true, 'support', false,
        'metricFact', '', 'metricPlan', '', 'effortCoefficient', 0
      ),
      true
    ),
    '{2026-Q4}',
    jsonb_build_object(
      'cost', b.q4, 'otherCosts', 0, 'costFinanceConfirmed', true,
      'comment', '', 'onTrack', true, 'support', false,
      'metricFact', '', 'metricPlan', '', 'effortCoefficient', 0
    ),
    true
  ),
  updated_at = timezone('utc'::text, now())
FROM public.team_budget_baseline_2026 b
WHERE i.deleted_at IS NULL
  AND i.unit = b.unit AND i.team = b.team
  AND i.unit = 'FAP' AND i.team = 'Codo'
  AND coalesce(i.is_timeline_stub, false) = true;

-- 2) Масштаб quarterly под baseline по командам (как align)
DO $$
DECLARE
  r record;
  q text;
  qd jsonb;
  c numeric;
BEGIN
  FOR r IN
    WITH team_year AS (
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
    ),
    team_scale AS (
      SELECT b.unit, b.team,
        CASE WHEN coalesce(t.live_year, 0) <= 0 THEN 1::numeric
             ELSE b.rub_all::numeric / t.live_year END AS scale_f
      FROM public.team_budget_baseline_2026 b
      LEFT JOIN team_year t ON t.unit = b.unit AND t.team = b.team
    )
    SELECT i.id, s.scale_f
    FROM public.initiatives i
    INNER JOIN team_scale s ON s.unit = i.unit AND s.team = i.team
    WHERE i.deleted_at IS NULL AND abs(s.scale_f - 1) > 0.000001
  LOOP
    SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = r.id;
    FOREACH q IN ARRAY ARRAY['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] LOOP
      c := round(COALESCE((qd #>> ARRAY[q, 'cost'])::numeric, 0) * r.scale_f);
      qd := jsonb_set(
        jsonb_set(coalesce(qd, '{}'::jsonb), ARRAY[q, 'cost'], to_jsonb(c), true),
        ARRAY[q, 'otherCosts'], '0'::jsonb, true
      );
    END LOOP;
    UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now()) WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Backfill split: is_in_pnl_it только если команда целиком PnL IT
UPDATE public.initiative_budget_department_2026 b
SET
  is_in_pnl_it = (tb.rub_pnl_it >= tb.rub_all),
  updated_at = timezone('utc'::text, now())
FROM public.initiatives i
INNER JOIN public.team_budget_baseline_2026 tb ON tb.unit = i.unit AND tb.team = i.team
WHERE b.initiative_id = i.id
  AND i.deleted_at IS NULL
  AND b.budget_department = '(из quarterly, без CSV split)';

-- 4) Контроль
SELECT
  2111435636::bigint AS list1_all,
  2038870010::bigint AS list1_pnl,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint FROM public.initiatives WHERE deleted_at IS NULL
  ) AS sum_quarterly,
  (
    SELECT round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint
    FROM public.initiative_budget_department_2026 b
    INNER JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL
    WHERE b.is_in_pnl_it
  ) AS sum_split_pnl,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives i
    JOIN public.team_budget_baseline_2026 tb ON tb.unit = i.unit AND tb.team = i.team
    WHERE i.deleted_at IS NULL AND tb.rub_all > 0
  ) AS sum_quarterly_in_baseline_teams,
  (
    SELECT round(sum(
      (
        COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
        + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
        + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
        + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
      ) * (tb.rub_pnl_it::numeric / tb.rub_all::numeric)
    ))::bigint
    FROM public.initiatives i
    JOIN public.team_budget_baseline_2026 tb ON tb.unit = i.unit AND tb.team = i.team
    WHERE i.deleted_at IS NULL AND tb.rub_all > 0
  ) AS ui_pnl_estimate_from_quarterly;

COMMIT;
