-- Официальные итоги юнитов и агрегированные показатели со сверенного
-- финансового представления от 2026-08-04.
-- Детальные карточки команд остаются неизменными по составу и настройкам.

BEGIN;

ALTER TABLE public.location_allocation_scenario_teams
  ALTER COLUMN people_count TYPE numeric(8, 2)
  USING people_count::numeric;

ALTER TABLE public.location_allocation_scenario_teams
  ADD COLUMN IF NOT EXISTS people_count_2025 numeric(8, 2) NULL
    CHECK (people_count_2025 IS NULL OR people_count_2025 >= 0),
  ADD COLUMN IF NOT EXISTS fot_change_rub bigint NULL,
  ADD COLUMN IF NOT EXISTS fot_growth_percent numeric(7, 2) NULL;

COMMENT ON COLUMN public.location_allocation_scenario_teams.people_count IS
  'Агрегированная численность команды за 2026 год без персональных данных.';
COMMENT ON COLUMN public.location_allocation_scenario_teams.people_count_2025 IS
  'Агрегированная численность команды за 2025 год, если она передана финансами.';
COMMENT ON COLUMN public.location_allocation_scenario_teams.fot_change_rub IS
  'Переданное финансами абсолютное изменение стоимости к предыдущему году.';
COMMENT ON COLUMN public.location_allocation_scenario_teams.fot_growth_percent IS
  'Переданное финансами изменение стоимости к предыдущему году в процентах.';

CREATE TABLE IF NOT EXISTS public.location_allocation_scenario_unit_totals (
  unit text PRIMARY KEY CHECK (length(trim(unit)) > 0),
  fot_2025_rub bigint NOT NULL CHECK (fot_2025_rub >= 0),
  fot_2026_rub bigint NOT NULL CHECK (fot_2026_rub >= 0),
  fot_change_rub bigint NOT NULL,
  fot_growth_percent numeric(7, 2) NOT NULL,
  people_count_2025 numeric(8, 2) NULL
    CHECK (people_count_2025 IS NULL OR people_count_2025 >= 0),
  people_count_2026 numeric(8, 2) NULL
    CHECK (people_count_2026 IS NULL OR people_count_2026 >= 0),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.location_allocation_scenario_unit_totals IS
  'Официальные итоги юнитов; могут включать скрытый менеджмент и нераспределённые прочие расходы.';

ALTER TABLE public.location_allocation_scenario_unit_totals
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read allocation scenario unit totals"
  ON public.location_allocation_scenario_unit_totals;
CREATE POLICY "Authenticated users read allocation scenario unit totals"
  ON public.location_allocation_scenario_unit_totals
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.location_allocation_scenario_unit_totals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.location_allocation_scenario_unit_totals
  TO authenticated;
GRANT ALL ON public.location_allocation_scenario_unit_totals
  TO service_role;

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

CREATE TEMP TABLE allocation_team_finance_targets (
  unit text NOT NULL,
  current_name text NOT NULL,
  source_team_match text NULL,
  people_count_2025 numeric(8, 2) NULL,
  people_count_2026 numeric(8, 2) NULL,
  fot_change_rub bigint NULL,
  fot_growth_percent numeric(7, 2) NULL,
  PRIMARY KEY (unit, current_name)
) ON COMMIT DROP;

INSERT INTO allocation_team_finance_targets (
  unit,
  current_name,
  source_team_match,
  people_count_2025,
  people_count_2026,
  fot_change_rub,
  fot_growth_percent
)
VALUES
  ('Data Office', 'B2B ML', 'AI Lab', NULL, 3, 2000000, 8),
  ('Data Office', 'Personalisation', NULL, NULL, 3, -2000000, -9),
  ('Data Office', 'BI', NULL, 6, 5, 11000000, 61),
  ('Data Office', 'Ad-hoc Analytics', NULL, NULL, 4, 5000000, 32),
  ('Data Office', 'Analytical Core', NULL, NULL, 4, 5000000, 23),
  ('Data Office', 'Pricing', NULL, NULL, 2, 1000000, 8),
  ('Data Office', 'Data Platform', NULL, NULL, 9.5, 15000000, 28),
  ('Data Office', 'Core Data', NULL, NULL, 6, 6000000, 19),
  ('Data Office', 'Forks on fire', NULL, NULL, 1, -9000000, -66),
  ('Data Office', 'B2B Product Analytics', NULL, NULL, 3, 8000000, 75),
  ('Data Office', 'B2C Product Analytics', NULL, NULL, 6, 8000000, 31),
  ('AI Hub', 'Knowledgebase', NULL, 2, 5, 5000000, 30),
  ('AI Hub', 'Marketplace', NULL, 7, 5, 6000000, 25),
  ('AI Hub', 'AI Forward', NULL, 0, 2, 13000000, 100),
  ('AI Hub', 'Support', NULL, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  expected_count integer;
  matched_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM allocation_team_finance_targets;

  SELECT count(*) INTO matched_count
  FROM allocation_team_finance_targets target
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = target.unit
    AND team_row.name = target.current_name
    AND NOT team_row.is_archived
    AND (
      target.source_team_match IS NULL
      OR team_row.source_team = target.source_team_match
    );

  IF matched_count <> expected_count THEN
    RAISE EXCEPTION
      'Finance metrics update requires % existing active teams; matched %',
      expected_count,
      matched_count;
  END IF;
END;
$$;

UPDATE public.location_allocation_scenario_teams team_row
SET
  people_count_2025 = target.people_count_2025,
  people_count = COALESCE(target.people_count_2026, team_row.people_count),
  fot_change_rub = target.fot_change_rub,
  fot_growth_percent = target.fot_growth_percent
FROM allocation_team_finance_targets target
WHERE team_row.unit = target.unit
  AND team_row.name = target.current_name
  AND NOT team_row.is_archived
  AND (
    target.source_team_match IS NULL
    OR team_row.source_team = target.source_team_match
  );

-- После скрытия headcount клиент имел доступ только к ограниченному набору
-- столбцов. Возвращаем лишь агрегированные показатели без персональных данных.
REVOKE SELECT ON public.location_allocation_scenario_teams
  FROM authenticated;
GRANT SELECT (
  id,
  unit,
  source_unit,
  source_team,
  name,
  description,
  fot_2025_rub,
  fot_2026_rub,
  people_count,
  people_count_2025,
  fot_change_rub,
  fot_growth_percent,
  run_percent,
  run_description,
  sort_order,
  is_archived
)
ON public.location_allocation_scenario_teams TO authenticated;

COMMIT;
