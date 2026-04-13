-- Drinkit как рынок с одной строкой в справочнике (как Россия/Турция), порядок между Russia и Central Asia.
INSERT INTO public.market_countries (cluster_key, label_ru, sort_order)
SELECT 'Drinkit', 'Drinkit', 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.market_countries mc
  WHERE mc.cluster_key = 'Drinkit' AND mc.label_ru = 'Drinkit'
);
