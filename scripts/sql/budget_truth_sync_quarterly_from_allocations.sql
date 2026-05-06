-- =============================================================================
-- Выровнять initiatives.quarterly_data (2026-Q1…Q4) под сумму строк
-- initiative_budget_department_2026 по каждому initiative_id.
--
-- cost = сумма q1…q4 по разбивке; otherCosts = 0; costFinanceConfirmed = true.
-- Запускать ПОСЛЕ budget_truth_sync_allocations.sql
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.initiative_budget_department_2026') IS NULL THEN
    RAISE EXCEPTION 'Нет public.initiative_budget_department_2026';
  END IF;
END
$guard$;

WITH agg AS (
  SELECT
    initiative_id,
    GREATEST(0, round(sum(q1)))::numeric AS s1,
    GREATEST(0, round(sum(q2)))::numeric AS s2,
    GREATEST(0, round(sum(q3)))::numeric AS s3,
    GREATEST(0, round(sum(q4)))::numeric AS s4
  FROM public.initiative_budget_department_2026
  GROUP BY initiative_id
)
UPDATE public.initiatives i
SET
  quarterly_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            COALESCE(i.quarterly_data, '{}'::jsonb),
                            ARRAY['2026-Q1','cost'],
                            to_jsonb(a.s1),
                            true
                          ),
                          ARRAY['2026-Q1','otherCosts'],
                          '0'::jsonb,
                          true
                        ),
                        ARRAY['2026-Q1','costFinanceConfirmed'],
                        'true'::jsonb,
                        true
                      ),
                      ARRAY['2026-Q2','cost'],
                      to_jsonb(a.s2),
                      true
                    ),
                    ARRAY['2026-Q2','otherCosts'],
                    '0'::jsonb,
                    true
                  ),
                  ARRAY['2026-Q2','costFinanceConfirmed'],
                  'true'::jsonb,
                  true
                ),
                ARRAY['2026-Q3','cost'],
                to_jsonb(a.s3),
                true
              ),
              ARRAY['2026-Q3','otherCosts'],
              '0'::jsonb,
              true
            ),
            ARRAY['2026-Q3','costFinanceConfirmed'],
            'true'::jsonb,
            true
          ),
          ARRAY['2026-Q4','cost'],
          to_jsonb(a.s4),
          true
        ),
        ARRAY['2026-Q4','otherCosts'],
        '0'::jsonb,
        true
      ),
      ARRAY['2026-Q4','costFinanceConfirmed'],
      'true'::jsonb,
      true
    ),
  updated_at = timezone('utc'::text, now())
FROM agg a
WHERE i.id = a.initiative_id
  AND COALESCE(i.is_timeline_stub, false) = false;
