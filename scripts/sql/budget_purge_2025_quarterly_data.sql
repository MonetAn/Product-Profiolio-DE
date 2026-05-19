-- Удалить все квартальные данные 2025 из initiatives.quarterly_data.
-- 2025 считался по старой методологии; в портфеле остаётся только 2026.
--
-- Удаляются ключи: 2025-Q1 … 2025-Q4, sheet_out_itog_2025.
-- Инициативы и команды не трогаем.
--
-- Проба: ROLLBACK в конце. Запись: COMMIT.

BEGIN;

-- До
SELECT
  count(*) FILTER (WHERE quarterly_data ? '2025-Q1')::int AS inits_with_2025_q1,
  count(*) FILTER (WHERE quarterly_data ? 'sheet_out_itog_2025')::int AS inits_with_sheet_2025,
  round(sum(
    COALESCE((quarterly_data #>> '{2025-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q1,otherCosts}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q2,otherCosts}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q3,otherCosts}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q4,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q4,otherCosts}')::numeric, 0)
  ))::bigint AS rub_2025_before
FROM public.initiatives
WHERE deleted_at IS NULL;

UPDATE public.initiatives i
SET
  quarterly_data =
    coalesce(i.quarterly_data, '{}'::jsonb)
    - '2025-Q1'
    - '2025-Q2'
    - '2025-Q3'
    - '2025-Q4'
    - 'sheet_out_itog_2025',
  updated_at = timezone('utc'::text, now())
WHERE i.deleted_at IS NULL
  AND (
    i.quarterly_data ? '2025-Q1'
    OR i.quarterly_data ? '2025-Q2'
    OR i.quarterly_data ? '2025-Q3'
    OR i.quarterly_data ? '2025-Q4'
    OR i.quarterly_data ? 'sheet_out_itog_2025'
  );

-- После
SELECT
  count(*) FILTER (WHERE quarterly_data ? '2025-Q1')::int AS inits_with_2025_q1_after,
  round(sum(
    COALESCE((quarterly_data #>> '{2025-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2025-Q4,cost}')::numeric, 0)
  ))::bigint AS rub_2025_after,
  round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ))::bigint AS rub_2026_cost_after
FROM public.initiatives
WHERE deleted_at IS NULL;

-- ROLLBACK;
COMMIT;
