-- Supabase/Postgres upsert с onConflict: 'unit,team,quarter' требует UNIQUE или PRIMARY KEY
-- на эти колонки. Если таблицу создавали из старого дампа без UNIQUE — сохранение состава падает с:
-- «there is no unique or exclusion constraint matching the ON CONFLICT specification».

-- Оставляем по одной строке на (unit, team, quarter): сохраняем запись с наибольшим id.
DELETE FROM public.team_quarter_snapshots AS a
WHERE EXISTS (
  SELECT 1
  FROM public.team_quarter_snapshots AS b
  WHERE b.unit = a.unit
    AND b.team = a.team
    AND b.quarter = a.quarter
    AND b.id > a.id
);

DO $m$
BEGIN
  ALTER TABLE public.team_quarter_snapshots
    ADD CONSTRAINT team_quarter_snapshots_unit_team_quarter_key UNIQUE (unit, team, quarter);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $m$;
