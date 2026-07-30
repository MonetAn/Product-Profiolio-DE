-- Platform — отдельное направление сценария аллокаций для работ,
-- общих для всех или большинства регионов. Оно не является географическим
-- регионом и используется только внутри презентационного сценария.

ALTER TABLE public.location_allocation_scenario_regions
  DROP CONSTRAINT IF EXISTS
    location_allocation_scenario_regions_region_check;

ALTER TABLE public.location_allocation_scenario_regions
  ADD CONSTRAINT location_allocation_scenario_regions_region_check
  CHECK (
    region IN (
      'Domestic Region',
      'International Region',
      'Drink It',
      'Platform'
    )
  );

INSERT INTO public.location_allocation_scenario_regions (
  team_id,
  region,
  sort_order
)
SELECT
  team.id,
  'Platform',
  3
FROM public.location_allocation_scenario_teams team
ON CONFLICT (team_id, region) DO NOTHING;
