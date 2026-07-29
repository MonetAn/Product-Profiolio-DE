-- Самостоятельный сценарий для командного представления аллокаций.
-- Исходные команды один раз копируются клиентом из портфеля, после чего
-- название, состав, порядок, ФОТ, люди и распределение живут независимо.

CREATE TABLE IF NOT EXISTS public.location_allocation_scenario_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  source_unit text NULL,
  source_team text NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text NOT NULL DEFAULT '',
  fot_2025_rub bigint NOT NULL DEFAULT 0 CHECK (fot_2025_rub >= 0),
  fot_2026_rub bigint NOT NULL DEFAULT 0 CHECK (fot_2026_rub >= 0),
  people_count integer NOT NULL DEFAULT 0 CHECK (people_count >= 0),
  run_percent numeric(6, 2) NOT NULL DEFAULT 0
    CHECK (run_percent >= 0 AND run_percent <= 100),
  run_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_location_allocation_scenario_source_team
  ON public.location_allocation_scenario_teams (source_unit, source_team)
  WHERE source_unit IS NOT NULL AND source_team IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_location_allocation_scenario_team_order
  ON public.location_allocation_scenario_teams (unit, is_archived, sort_order, name);

CREATE TABLE IF NOT EXISTS public.location_allocation_scenario_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL
    REFERENCES public.location_allocation_scenario_teams(id) ON DELETE CASCADE,
  region text NOT NULL
    CHECK (region IN ('Domestic Region', 'International Region', 'Drink It')),
  percent numeric(6, 2) NOT NULL DEFAULT 0
    CHECK (percent >= 0 AND percent <= 100),
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (team_id, region)
);

CREATE INDEX IF NOT EXISTS idx_location_allocation_scenario_region_order
  ON public.location_allocation_scenario_regions (team_id, sort_order, region);

COMMENT ON TABLE public.location_allocation_scenario_teams IS
  'Кастомизируемые команды сценария аллокаций, независимые от исходной оргструктуры после первого импорта.';

COMMENT ON TABLE public.location_allocation_scenario_regions IS
  'Процент и свободное описание результата команды для каждого региона.';

ALTER TABLE public.location_allocation_scenario_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_allocation_scenario_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read allocation scenario teams"
  ON public.location_allocation_scenario_teams;
CREATE POLICY "Authenticated users read allocation scenario teams"
  ON public.location_allocation_scenario_teams
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users write allocation scenario teams"
  ON public.location_allocation_scenario_teams;
CREATE POLICY "Authenticated users write allocation scenario teams"
  ON public.location_allocation_scenario_teams
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users read allocation scenario regions"
  ON public.location_allocation_scenario_regions;
CREATE POLICY "Authenticated users read allocation scenario regions"
  ON public.location_allocation_scenario_regions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users write allocation scenario regions"
  ON public.location_allocation_scenario_regions;
CREATE POLICY "Authenticated users write allocation scenario regions"
  ON public.location_allocation_scenario_regions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.location_allocation_scenario_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.location_allocation_scenario_regions TO authenticated;
