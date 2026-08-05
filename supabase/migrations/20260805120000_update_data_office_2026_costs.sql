-- Обновление только стоимости 2026 существующих команд Data Office
-- по финальной таблице от 2026-08-05.
-- История 2025, состав команд, описания и коэффициенты не меняются.

BEGIN;

CREATE TEMP TABLE allocation_2026_cost_targets (
  unit text NOT NULL,
  current_name text NOT NULL,
  source_team_match text NULL,
  cost_2026_rub bigint NOT NULL,
  PRIMARY KEY (unit, current_name)
) ON COMMIT DROP;

INSERT INTO allocation_2026_cost_targets (
  unit,
  current_name,
  source_team_match,
  cost_2026_rub
)
VALUES
  ('Data Office', 'B2B ML', 'AI Lab', 20000000),
  ('Data Office', 'Personalisation', NULL, 21000000),
  ('Data Office', 'BI', NULL, 28000000),
  ('Data Office', 'Ad-hoc Analytics', NULL, 19000000),
  ('Data Office', 'Analytical Core', NULL, 24000000),
  ('Data Office', 'Pricing', NULL, 11000000),
  ('Data Office', 'Data Platform', NULL, 68000000),
  ('Data Office', 'Core Data', NULL, 55000000),
  ('Data Office', 'Forks on fire', NULL, 30000000),
  ('Data Office', 'B2B Product Analytics', NULL, 19000000),
  ('Data Office', 'B2C Product Analytics', NULL, 36000000);

DO $$
DECLARE
  expected_count integer;
  matched_count integer;
  ambiguous_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM allocation_2026_cost_targets;

  SELECT count(*) INTO matched_count
  FROM allocation_2026_cost_targets target
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
    FROM allocation_2026_cost_targets target
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
      '2026 cost update requires exactly % active teams; matched %, ambiguous %',
      expected_count,
      matched_count,
      ambiguous_count;
  END IF;
END;
$$;

UPDATE public.location_allocation_scenario_teams team_row
SET
  fot_2026_rub = target.cost_2026_rub,
  updated_at = timezone('utc'::text, now())
FROM allocation_2026_cost_targets target
WHERE team_row.unit = target.unit
  AND team_row.name = target.current_name
  AND NOT team_row.is_archived
  AND (
    target.source_team_match IS NULL
    OR team_row.source_team = target.source_team_match
  );

UPDATE public.location_allocation_scenario_unit_totals
SET
  fot_2026_rub = 329000000,
  updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office';

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM allocation_2026_cost_targets target
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = target.unit
    AND team_row.name = target.current_name
    AND NOT team_row.is_archived
    AND (
      target.source_team_match IS NULL
      OR team_row.source_team = target.source_team_match
    )
  WHERE team_row.fot_2026_rub IS DISTINCT FROM target.cost_2026_rub;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION '2026 cost verification failed for % teams', mismatch_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.location_allocation_scenario_unit_totals
    WHERE unit = 'Data Office'
      AND fot_2026_rub = 329000000
  ) THEN
    RAISE EXCEPTION 'Data Office 2026 total verification failed';
  END IF;
END;
$$;

COMMIT;
