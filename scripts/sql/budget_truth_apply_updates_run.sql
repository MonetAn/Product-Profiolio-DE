-- =============================================================================
-- Шаг 2: применить правки (выполнять после preview из budget_truth_apply_updates.sql).
-- Рекомендуется: begin; → этот файл → проверка → commit; или rollback;
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public._budget_truth_csv') IS NULL THEN
    RAISE EXCEPTION
      'Нет таблицы public._budget_truth_csv. Сначала выполните scripts/out/*-truth-insert.sql';
  END IF;
END
$guard$;

DO $dup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.initiatives
    WHERE COALESCE(is_timeline_stub, false) = false
    GROUP BY initiative, unit, team
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'В initiatives есть дубликаты (initiative, unit, team) среди не-stub строк. Исправьте вручную до массового UPDATE';
  END IF;
END
$dup$;

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
                    i.quarterly_data,
                    ARRAY['2026-Q1','cost'],
                    to_jsonb(
                      GREATEST(
                        0::numeric,
                        ROUND(
                          t.q1::numeric
                          - COALESCE((i.quarterly_data->'2026-Q1'->>'otherCosts')::numeric, 0)
                        )
                      )::numeric
                    ),
                    true
                  ),
                  ARRAY['2026-Q1','costFinanceConfirmed'],
                  'true'::jsonb,
                  true
                ),
                ARRAY['2026-Q2','cost'],
                to_jsonb(
                  GREATEST(
                    0::numeric,
                    ROUND(
                      t.q2::numeric
                      - COALESCE((i.quarterly_data->'2026-Q2'->>'otherCosts')::numeric, 0)
                    )
                  )::numeric
                ),
                true
              ),
              ARRAY['2026-Q2','costFinanceConfirmed'],
              'true'::jsonb,
              true
            ),
            ARRAY['2026-Q3','cost'],
            to_jsonb(
              GREATEST(
                0::numeric,
                ROUND(
                  t.q3::numeric
                  - COALESCE((i.quarterly_data->'2026-Q3'->>'otherCosts')::numeric, 0)
                )
              )::numeric
            ),
            true
          ),
          ARRAY['2026-Q3','costFinanceConfirmed'],
          'true'::jsonb,
          true
        ),
        ARRAY['2026-Q4','cost'],
        to_jsonb(
          GREATEST(
            0::numeric,
            ROUND(
              t.q4::numeric
              - COALESCE((i.quarterly_data->'2026-Q4'->>'otherCosts')::numeric, 0)
            )
          )::numeric
        ),
        true
      ),
      ARRAY['2026-Q4','costFinanceConfirmed'],
      'true'::jsonb,
      true
    ),
  updated_at = timezone('utc'::text, now())
FROM public._budget_truth_csv t
WHERE trim(i.initiative) = t.initiative
  AND trim(i.unit) = t.unit
  AND trim(i.team) = t.team
  AND COALESCE(i.is_timeline_stub, false) = false
  AND (
       abs(
         t.q1
         - (
           COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric, 0)
           + COALESCE((i.quarterly_data->'2026-Q1'->>'otherCosts')::numeric, 0)
         )
       )
       > 1
    OR abs(
         t.q2
         - (
           COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric, 0)
           + COALESCE((i.quarterly_data->'2026-Q2'->>'otherCosts')::numeric, 0)
         )
       )
       > 1
    OR abs(
         t.q3
         - (
           COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric, 0)
           + COALESCE((i.quarterly_data->'2026-Q3'->>'otherCosts')::numeric, 0)
         )
       )
       > 1
    OR abs(
         t.q4
         - (
           COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric, 0)
           + COALESCE((i.quarterly_data->'2026-Q4'->>'otherCosts')::numeric, 0)
         )
       )
       > 1
  );
