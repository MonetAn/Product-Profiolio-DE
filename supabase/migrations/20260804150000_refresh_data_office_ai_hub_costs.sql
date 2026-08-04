-- Обновление стоимости и агрегированных показателей существующих команд
-- Data Office и AI Hub по файлу «Эффективные аллокации 2026 — Детально».
-- Состав команд, названия, порядок, описания и коэффициенты не меняются.

BEGIN;

CREATE TEMP TABLE allocation_finance_refresh_targets (
  unit text NOT NULL,
  current_name text NOT NULL,
  source_team_match text NULL,
  cost_2025_rub bigint NOT NULL,
  cost_2026_rub bigint NOT NULL,
  people_count_2025 numeric(8, 2) NULL,
  people_count_2026 numeric(8, 2) NULL,
  cost_change_rub bigint NULL,
  cost_growth_percent numeric(7, 2) NULL,
  PRIMARY KEY (unit, current_name)
) ON COMMIT DROP;

INSERT INTO allocation_finance_refresh_targets (
  unit,
  current_name,
  source_team_match,
  cost_2025_rub,
  cost_2026_rub,
  people_count_2025,
  people_count_2026,
  cost_change_rub,
  cost_growth_percent
)
VALUES
  ('Data Office', 'B2B ML', 'AI Lab', 20000000, 20000000, NULL, 3, 0, -1),
  ('Data Office', 'Personalisation', NULL, 25000000, 21000000, NULL, 3, -4000000, -17),
  ('Data Office', 'BI', NULL, 17000000, 28000000, 6, 5, 11000000, 61),
  ('Data Office', 'Ad-hoc Analytics', NULL, 15000000, 19000000, NULL, 4, 4000000, 25),
  ('Data Office', 'Analytical Core', NULL, 21000000, 24000000, NULL, 4, 3000000, 14),
  ('Data Office', 'Pricing', NULL, 11000000, 11000000, NULL, 2, 0, 2),
  ('Data Office', 'Data Platform', NULL, 57000000, 68000000, NULL, 9.5, 11000000, 19),
  ('Data Office', 'Core Data', NULL, 33000000, 37000000, NULL, 6, 4000000, 11),
  ('Data Office', 'Forks on fire', NULL, 15000000, 16000000, NULL, 1, 1000000, 4),
  ('Data Office', 'B2B Product Analytics', NULL, 11000000, 19000000, NULL, 3, 8000000, 75),
  ('Data Office', 'B2C Product Analytics', NULL, 27000000, 36000000, NULL, 6, 8000000, 31),
  ('AI Hub', 'Knowledgebase', NULL, 17000000, 23000000, 2, 5, 5000000, 30),
  ('AI Hub', 'Marketplace', NULL, 24000000, 30000000, 7, 5, 6000000, 25),
  ('AI Hub', 'AI Forward', NULL, 0, 13000000, 0, 2, 13000000, 100),
  ('AI Hub', 'Support', NULL, 0, 0, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  expected_count integer;
  matched_count integer;
  ambiguous_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM allocation_finance_refresh_targets;

  SELECT count(*) INTO matched_count
  FROM allocation_finance_refresh_targets target
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
    FROM allocation_finance_refresh_targets target
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
      'Cost refresh requires exactly % existing active teams; matched %, ambiguous %',
      expected_count,
      matched_count,
      ambiguous_count;
  END IF;
END;
$$;

UPDATE public.location_allocation_scenario_teams team_row
SET
  fot_2025_rub = target.cost_2025_rub,
  fot_2026_rub = target.cost_2026_rub,
  people_count_2025 = target.people_count_2025,
  people_count = COALESCE(target.people_count_2026, team_row.people_count),
  fot_change_rub = target.cost_change_rub,
  fot_growth_percent = target.cost_growth_percent,
  updated_at = timezone('utc'::text, now())
FROM allocation_finance_refresh_targets target
WHERE team_row.unit = target.unit
  AND team_row.name = target.current_name
  AND NOT team_row.is_archived
  AND (
    target.source_team_match IS NULL
    OR team_row.source_team = target.source_team_match
  );

INSERT INTO public.location_allocation_scenario_unit_totals (
  unit,
  fot_2025_rub,
  fot_2026_rub,
  fot_change_rub,
  fot_growth_percent,
  people_count_2025,
  people_count_2026,
  updated_at
)
VALUES
  ('Data Office', 273000000, 329000000, 56000000, 20, 45, 48, timezone('utc'::text, now())),
  ('AI Hub', 41000000, 65000000, 19000000, 45, 16, 16, timezone('utc'::text, now()))
ON CONFLICT (unit) DO UPDATE
SET
  fot_2025_rub = EXCLUDED.fot_2025_rub,
  fot_2026_rub = EXCLUDED.fot_2026_rub,
  fot_change_rub = EXCLUDED.fot_change_rub,
  fot_growth_percent = EXCLUDED.fot_growth_percent,
  people_count_2025 = EXCLUDED.people_count_2025,
  people_count_2026 = EXCLUDED.people_count_2026,
  updated_at = EXCLUDED.updated_at;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM allocation_finance_refresh_targets target
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = target.unit
    AND team_row.name = target.current_name
    AND NOT team_row.is_archived
    AND (
      target.source_team_match IS NULL
      OR team_row.source_team = target.source_team_match
    )
  WHERE team_row.fot_2025_rub IS DISTINCT FROM target.cost_2025_rub
    OR team_row.fot_2026_rub IS DISTINCT FROM target.cost_2026_rub
    OR team_row.people_count_2025 IS DISTINCT FROM target.people_count_2025
    OR (
      target.people_count_2026 IS NOT NULL
      AND team_row.people_count IS DISTINCT FROM target.people_count_2026
    )
    OR team_row.fot_change_rub IS DISTINCT FROM target.cost_change_rub
    OR team_row.fot_growth_percent IS DISTINCT FROM target.cost_growth_percent;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Cost refresh verification failed for % teams', mismatch_count;
  END IF;
END;
$$;

COMMIT;
