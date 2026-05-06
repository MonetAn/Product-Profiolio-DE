-- Распределение по рынкам/странам: один набор процентов на инициативу (не на квартал).
-- Удаляем устаревший geoCostSplit из quarterly_data.

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS geo_cost_split jsonb NULL;

COMMENT ON COLUMN public.initiatives.geo_cost_split IS
  'Проценты по market_countries/кластерам на инициативу (сумма 100%). К аналитике: cost квартала × эти доли.';

UPDATE public.initiatives
SET quarterly_data = sub.merged
FROM (
  SELECT
    i.id,
    COALESCE(
      (
        SELECT jsonb_object_agg(
          kv.key,
          CASE
            WHEN jsonb_typeof(kv.value) = 'object'
            THEN kv.value - 'geoCostSplit'
            ELSE kv.value
          END
        )
        FROM jsonb_each(COALESCE(i.quarterly_data, '{}'::jsonb)) AS kv
      ),
      '{}'::jsonb
    ) AS merged
  FROM public.initiatives i
) AS sub
WHERE initiatives.id = sub.id
  AND initiatives.quarterly_data IS NOT NULL;
