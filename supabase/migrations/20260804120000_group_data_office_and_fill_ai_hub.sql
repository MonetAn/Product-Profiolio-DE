-- Обновление только ФОТ 2025/2026 существующих команд Data Office и AI Hub
-- по перепроверенной финансовым партнёром версии от 2026-08-04.
-- Состав команд, названия, порядок, описания и коэффициенты не меняются.

BEGIN;

CREATE TABLE IF NOT EXISTS public.location_allocation_scenario_grouping_backups (
  snapshot_key text PRIMARY KEY,
  scope_units text[] NOT NULL,
  teams jsonb NOT NULL,
  regions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.location_allocation_scenario_grouping_backups IS
  'Закрытые системные снимки сценария аллокаций перед массовым обновлением ФОТ.';

ALTER TABLE public.location_allocation_scenario_grouping_backups
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.location_allocation_scenario_grouping_backups
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.location_allocation_scenario_grouping_backups (
  snapshot_key,
  scope_units,
  teams,
  regions
)
SELECT
  '2026-08-04-pre-data-office-ai-hub-grouping',
  ARRAY['Data Office', 'AI Hub']::text[],
  COALESCE(
    (
      SELECT jsonb_agg(
        to_jsonb(team_row)
        ORDER BY team_row.unit, team_row.sort_order, team_row.name, team_row.id
      )
      FROM public.location_allocation_scenario_teams team_row
      WHERE team_row.unit IN ('Data Office', 'AI Hub')
    ),
    '[]'::jsonb
  ),
  COALESCE(
    (
      SELECT jsonb_agg(
        to_jsonb(region_row)
        ORDER BY region_row.team_id, region_row.sort_order, region_row.region, region_row.id
      )
      FROM public.location_allocation_scenario_regions region_row
      JOIN public.location_allocation_scenario_teams team_row
        ON team_row.id = region_row.team_id
      WHERE team_row.unit IN ('Data Office', 'AI Hub')
    ),
    '[]'::jsonb
  )
ON CONFLICT (snapshot_key) DO NOTHING;

CREATE TEMP TABLE allocation_fot_targets (
  unit text NOT NULL,
  current_name text NOT NULL,
  source_team_match text NULL,
  fot_2025_rub bigint NOT NULL,
  fot_2026_rub bigint NOT NULL,
  PRIMARY KEY (unit, current_name)
) ON COMMIT DROP;

INSERT INTO allocation_fot_targets (
  unit,
  current_name,
  source_team_match,
  fot_2025_rub,
  fot_2026_rub
)
VALUES
  ('Data Office', 'B2B ML', 'AI Lab', 19000000, 20000000),
  ('Data Office', 'Personalisation', NULL, 23000000, 21000000),
  ('Data Office', 'BI', NULL, 17000000, 28000000),
  ('Data Office', 'Ad-hoc Analytics', NULL, 15000000, 19000000),
  ('Data Office', 'Analytical Core', NULL, 20000000, 24000000),
  ('Data Office', 'Pricing', NULL, 10000000, 11000000),
  ('Data Office', 'Data Platform', NULL, 53000000, 68000000),
  ('Data Office', 'Core Data', NULL, 31000000, 37000000),
  ('Data Office', 'Forks on fire', NULL, 14000000, 5000000),
  ('Data Office', 'B2B Product Analytics', NULL, 11000000, 19000000),
  ('Data Office', 'B2C Product Analytics', NULL, 27000000, 36000000),
  ('AI Hub', 'Knowledgebase', NULL, 17000000, 23000000),
  ('AI Hub', 'Marketplace', NULL, 24000000, 30000000),
  ('AI Hub', 'AI Forward', NULL, 0, 13000000),
  ('AI Hub', 'Support', NULL, 0, 0);

DO $$
DECLARE
  expected_count integer;
  matched_count integer;
  ambiguous_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM allocation_fot_targets;

  SELECT count(*) INTO matched_count
  FROM allocation_fot_targets target
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = target.unit
    AND team_row.name = target.current_name
    AND NOT team_row.is_archived
    AND (
      target.source_team_match IS NULL
      OR team_row.source_team = target.source_team_match
    );

  SELECT count(*) INTO ambiguous_count
  FROM (
    SELECT target.unit, target.current_name
    FROM allocation_fot_targets target
    JOIN public.location_allocation_scenario_teams team_row
      ON team_row.unit = target.unit
      AND team_row.name = target.current_name
      AND NOT team_row.is_archived
      AND (
        target.source_team_match IS NULL
        OR team_row.source_team = target.source_team_match
      )
    GROUP BY target.unit, target.current_name
    HAVING count(*) <> 1
  ) duplicates_or_missing;

  IF matched_count <> expected_count OR ambiguous_count <> 0 THEN
    RAISE EXCEPTION
      'FOT update requires exactly % existing active teams; matched %, ambiguous %',
      expected_count,
      matched_count,
      ambiguous_count;
  END IF;
END;
$$;

UPDATE public.location_allocation_scenario_teams team_row
SET
  fot_2025_rub = target.fot_2025_rub,
  fot_2026_rub = target.fot_2026_rub
FROM allocation_fot_targets target
WHERE team_row.unit = target.unit
  AND team_row.name = target.current_name
  AND NOT team_row.is_archived
  AND (
    target.source_team_match IS NULL
    OR team_row.source_team = target.source_team_match
  );

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM allocation_fot_targets target
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = target.unit
    AND team_row.name = target.current_name
    AND NOT team_row.is_archived
    AND (
      target.source_team_match IS NULL
      OR team_row.source_team = target.source_team_match
    )
  WHERE team_row.fot_2025_rub IS DISTINCT FROM target.fot_2025_rub
    OR team_row.fot_2026_rub IS DISTINCT FROM target.fot_2026_rub;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'FOT verification failed for % teams', mismatch_count;
  END IF;
END;
$$;

COMMIT;
