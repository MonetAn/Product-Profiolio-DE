-- Полный возврат Data Office и AI Hub к состоянию до миграции
-- 20260804120000_group_data_office_and_fill_ai_hub.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.location_allocation_scenario_grouping_backups
    WHERE snapshot_key = '2026-08-04-pre-data-office-ai-hub-grouping'
  ) THEN
    RAISE EXCEPTION 'Allocation grouping backup is not available';
  END IF;
END;
$$;

ALTER TABLE public.location_allocation_scenario_teams
  DISABLE TRIGGER trg_guard_allocation_scenario_team_structure;

DELETE FROM public.location_allocation_scenario_unit_totals
WHERE unit IN ('Data Office', 'AI Hub');

DELETE FROM public.location_allocation_scenario_teams
WHERE unit IN ('Data Office', 'AI Hub');

INSERT INTO public.location_allocation_scenario_teams (
  id,
  unit,
  source_unit,
  source_team,
  name,
  description,
  fot_2025_rub,
  fot_2026_rub,
  people_count,
  run_percent,
  run_description,
  sort_order,
  is_archived,
  created_by,
  updated_by,
  updated_by_name,
  created_at,
  updated_at
)
SELECT
  restored.id,
  restored.unit,
  restored.source_unit,
  restored.source_team,
  restored.name,
  restored.description,
  restored.fot_2025_rub,
  restored.fot_2026_rub,
  restored.people_count,
  restored.run_percent,
  restored.run_description,
  restored.sort_order,
  restored.is_archived,
  CASE
    WHEN restored.created_by IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM auth.users auth_user
      WHERE auth_user.id = restored.created_by
    ) THEN restored.created_by
    ELSE NULL
  END,
  CASE
    WHEN restored.updated_by IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM auth.users auth_user
      WHERE auth_user.id = restored.updated_by
    ) THEN restored.updated_by
    ELSE NULL
  END,
  restored.updated_by_name,
  restored.created_at,
  restored.updated_at
FROM public.location_allocation_scenario_grouping_backups backup
CROSS JOIN LATERAL jsonb_to_recordset(backup.teams) AS restored(
  id uuid,
  unit text,
  source_unit text,
  source_team text,
  name text,
  description text,
  fot_2025_rub bigint,
  fot_2026_rub bigint,
  people_count integer,
  run_percent numeric,
  run_description text,
  sort_order integer,
  is_archived boolean,
  created_by uuid,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
WHERE backup.snapshot_key = '2026-08-04-pre-data-office-ai-hub-grouping';

INSERT INTO public.location_allocation_scenario_regions (
  id,
  team_id,
  region,
  percent,
  description,
  sort_order,
  created_by,
  updated_by,
  updated_by_name,
  created_at,
  updated_at
)
SELECT
  restored.id,
  restored.team_id,
  restored.region,
  restored.percent,
  restored.description,
  restored.sort_order,
  CASE
    WHEN restored.created_by IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM auth.users auth_user
      WHERE auth_user.id = restored.created_by
    ) THEN restored.created_by
    ELSE NULL
  END,
  CASE
    WHEN restored.updated_by IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM auth.users auth_user
      WHERE auth_user.id = restored.updated_by
    ) THEN restored.updated_by
    ELSE NULL
  END,
  restored.updated_by_name,
  restored.created_at,
  restored.updated_at
FROM public.location_allocation_scenario_grouping_backups backup
CROSS JOIN LATERAL jsonb_to_recordset(backup.regions) AS restored(
  id uuid,
  team_id uuid,
  region text,
  percent numeric,
  description text,
  sort_order integer,
  created_by uuid,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
WHERE backup.snapshot_key = '2026-08-04-pre-data-office-ai-hub-grouping';

ALTER TABLE public.location_allocation_scenario_teams
  ENABLE TRIGGER trg_guard_allocation_scenario_team_structure;

COMMIT;
