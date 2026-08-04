-- Верхнеуровневые команды Data Office и актуальный ФОТ AI Hub.
-- Детальные команды не удаляются: перед изменением сохраняем полный снимок,
-- а сами строки оставляем архивными для быстрого возврата старой структуры.
-- Введённые пользователями проценты, RUN и описания не пересчитываем
-- и не переносим: у сохраняемой карточки меняются только структура и ФОТ.

BEGIN;

CREATE TABLE IF NOT EXISTS public.location_allocation_scenario_grouping_backups (
  snapshot_key text PRIMARY KEY,
  scope_units text[] NOT NULL,
  teams jsonb NOT NULL,
  regions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.location_allocation_scenario_grouping_backups IS
  'Закрытые системные снимки сценария аллокаций перед изменением структуры команд.';

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
      SELECT jsonb_agg(to_jsonb(team_row) ORDER BY team_row.unit, team_row.sort_order, team_row.name, team_row.id)
      FROM public.location_allocation_scenario_teams team_row
      WHERE team_row.unit IN ('Data Office', 'AI Hub')
    ),
    '[]'::jsonb
  ),
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(region_row) ORDER BY region_row.team_id, region_row.sort_order, region_row.region, region_row.id)
      FROM public.location_allocation_scenario_regions region_row
      JOIN public.location_allocation_scenario_teams team_row
        ON team_row.id = region_row.team_id
      WHERE team_row.unit IN ('Data Office', 'AI Hub')
    ),
    '[]'::jsonb
  )
ON CONFLICT (snapshot_key) DO NOTHING;

CREATE TEMP TABLE allocation_group_parents (
  parent_name text PRIMARY KEY,
  fot_2025_rub bigint NOT NULL,
  fot_2026_rub bigint NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO allocation_group_parents (
  parent_name,
  fot_2025_rub,
  fot_2026_rub,
  sort_order
)
VALUES
  ('AI Lab', 41353623, 40796259, 0),
  ('Data Analytics', 44729420, 54786693, 2),
  ('Data Platform', 98556062, 109892805, 3),
  ('Product Analytics', 38097505, 54469260, 4);

CREATE TEMP TABLE allocation_group_children (
  parent_name text NOT NULL,
  child_name text NOT NULL,
  source_team_match text NULL,
  is_keeper boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO allocation_group_children (
  parent_name,
  child_name,
  source_team_match,
  is_keeper
)
VALUES
  ('AI Lab', 'B2B ML', 'AI Lab', true),
  ('AI Lab', 'Personalisation', NULL, false),
  ('Data Analytics', 'Ad-hoc Analytics', NULL, false),
  ('Data Analytics', 'Analytical Core', NULL, true),
  ('Data Analytics', 'Pricing', NULL, false),
  ('Data Platform', 'Data Platform', NULL, true),
  ('Data Platform', 'Core Data', NULL, false),
  ('Data Platform', 'Forks on fire', NULL, false),
  ('Product Analytics', 'B2B Product Analytics', NULL, true),
  ('Product Analytics', 'B2C Product Analytics', NULL, false);

DO $$
DECLARE
  expected_children integer;
  actual_children integer;
BEGIN
  SELECT count(*) INTO expected_children
  FROM allocation_group_children;

  SELECT count(*) INTO actual_children
  FROM allocation_group_children child
  JOIN public.location_allocation_scenario_teams team_row
    ON team_row.unit = 'Data Office'
    AND team_row.name = child.child_name
    AND NOT team_row.is_archived
    AND (
      child.source_team_match IS NULL
      OR team_row.source_team = child.source_team_match
    );

  IF actual_children <> expected_children THEN
    RAISE EXCEPTION
      'Data Office grouping expected % active child teams, found %',
      expected_children,
      actual_children;
  END IF;
END;
$$;

CREATE TEMP TABLE allocation_group_results ON COMMIT DROP AS
SELECT
  parent.parent_name,
  parent.fot_2025_rub,
  parent.fot_2026_rub,
  parent.sort_order,
  (
    max(team_row.id::text) FILTER (WHERE child.is_keeper)
  )::uuid AS keeper_id
FROM allocation_group_parents parent
JOIN allocation_group_children child
  ON child.parent_name = parent.parent_name
JOIN public.location_allocation_scenario_teams team_row
  ON team_row.unit = 'Data Office'
  AND team_row.name = child.child_name
  AND NOT team_row.is_archived
  AND (
    child.source_team_match IS NULL
    OR team_row.source_team = child.source_team_match
  )
GROUP BY
  parent.parent_name,
  parent.fot_2025_rub,
  parent.fot_2026_rub,
  parent.sort_order;

ALTER TABLE public.location_allocation_scenario_teams
  DISABLE TRIGGER trg_guard_allocation_scenario_team_structure;

UPDATE public.location_allocation_scenario_teams
SET
  is_archived = true,
  updated_by = NULL,
  updated_by_name = 'Codex · ФОТ IT (2)',
  updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office';

UPDATE public.location_allocation_scenario_teams team_row
SET
  source_unit = NULL,
  source_team = NULL,
  name = grouped.parent_name,
  fot_2025_rub = grouped.fot_2025_rub,
  fot_2026_rub = grouped.fot_2026_rub,
  sort_order = grouped.sort_order,
  is_archived = false,
  created_by = CASE
    WHEN team_row.created_by IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM auth.users auth_user
      WHERE auth_user.id = team_row.created_by
    ) THEN team_row.created_by
    ELSE NULL
  END,
  updated_by = NULL,
  updated_by_name = 'Codex · ФОТ IT (2)',
  updated_at = timezone('utc'::text, now())
FROM allocation_group_results grouped
WHERE team_row.id = grouped.keeper_id;

INSERT INTO public.location_allocation_scenario_teams (
  unit,
  name,
  description,
  fot_2025_rub,
  fot_2026_rub,
  people_count,
  run_percent,
  run_description,
  sort_order,
  is_archived,
  updated_by_name
)
SELECT
  'Data Office',
  'B2B',
  '',
  15350867,
  27625327,
  0,
  0,
  '',
  1,
  false,
  'Codex · ФОТ IT (2)'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.location_allocation_scenario_teams existing
  WHERE existing.unit = 'Data Office'
    AND existing.name = 'B2B'
    AND NOT existing.is_archived
);

INSERT INTO public.location_allocation_scenario_regions (
  team_id,
  region,
  percent,
  description,
  sort_order,
  updated_by_name
)
SELECT
  team_row.id,
  area.region,
  0,
  '',
  area.sort_order,
  'Codex · ФОТ IT (2)'
FROM public.location_allocation_scenario_teams team_row
CROSS JOIN (
  VALUES
    ('Domestic Region', 0),
    ('International Region', 1),
    ('Drink It', 2),
    ('Platform', 3)
) AS area(region, sort_order)
WHERE team_row.unit = 'Data Office'
  AND NOT team_row.is_archived
  AND team_row.name IN (
    'AI Lab',
    'B2B',
    'Data Analytics',
    'Data Platform',
    'Product Analytics'
  )
ON CONFLICT (team_id, region) DO NOTHING;

CREATE TEMP TABLE ai_hub_targets (
  name text PRIMARY KEY,
  legacy_name text NULL,
  fot_2025_rub bigint NOT NULL,
  fot_2026_rub bigint NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO ai_hub_targets (
  name,
  legacy_name,
  fot_2025_rub,
  fot_2026_rub,
  sort_order
)
VALUES
  ('Knowledgebase', NULL, 16137036, 17799826, 0),
  ('Marketplace', NULL, 22965173, 27992790, 1),
  ('AI Forward', NULL, 0, 6340473, 2),
  ('Customer Support', 'Support', 47776986, 50548088, 3);

UPDATE public.location_allocation_scenario_teams
SET
  is_archived = true,
  updated_by = NULL,
  updated_by_name = 'Codex · ФОТ IT (2)',
  updated_at = timezone('utc'::text, now())
WHERE unit = 'AI Hub';

DO $$
DECLARE
  target ai_hub_targets%ROWTYPE;
  target_team_id uuid;
BEGIN
  FOR target IN
    SELECT * FROM ai_hub_targets ORDER BY sort_order
  LOOP
    SELECT team_row.id
      INTO target_team_id
    FROM public.location_allocation_scenario_teams team_row
    WHERE team_row.unit = 'AI Hub'
      AND team_row.name IN (target.name, COALESCE(target.legacy_name, target.name))
    ORDER BY
      CASE WHEN team_row.name = target.name THEN 0 ELSE 1 END,
      team_row.created_at,
      team_row.id
    LIMIT 1;

    IF target_team_id IS NULL THEN
      INSERT INTO public.location_allocation_scenario_teams (
        unit,
        name,
        fot_2025_rub,
        fot_2026_rub,
        people_count,
        sort_order,
        is_archived,
        updated_by_name
      )
      VALUES (
        'AI Hub',
        target.name,
        target.fot_2025_rub,
        target.fot_2026_rub,
        0,
        target.sort_order,
        false,
        'Codex · ФОТ IT (2)'
      )
      RETURNING id INTO target_team_id;
    ELSE
      UPDATE public.location_allocation_scenario_teams
      SET
        source_unit = NULL,
        source_team = NULL,
        name = target.name,
        fot_2025_rub = target.fot_2025_rub,
        fot_2026_rub = target.fot_2026_rub,
        sort_order = target.sort_order,
        is_archived = false,
        created_by = CASE
          WHEN location_allocation_scenario_teams.created_by IS NULL THEN NULL
          WHEN EXISTS (
            SELECT 1 FROM auth.users auth_user
            WHERE auth_user.id = location_allocation_scenario_teams.created_by
          ) THEN location_allocation_scenario_teams.created_by
          ELSE NULL
        END,
        updated_by = NULL,
        updated_by_name = 'Codex · ФОТ IT (2)',
        updated_at = timezone('utc'::text, now())
      WHERE id = target_team_id;
    END IF;

    INSERT INTO public.location_allocation_scenario_regions (
      team_id,
      region,
      percent,
      description,
      sort_order,
      updated_by_name
    )
    SELECT
      target_team_id,
      area.region,
      0,
      '',
      area.sort_order,
      'Codex · ФОТ IT (2)'
    FROM (
      VALUES
        ('Domestic Region', 0),
        ('International Region', 1),
        ('Drink It', 2),
        ('Platform', 3)
    ) AS area(region, sort_order)
    ON CONFLICT (team_id, region) DO NOTHING;
  END LOOP;
END;
$$;

ALTER TABLE public.location_allocation_scenario_teams
  ENABLE TRIGGER trg_guard_allocation_scenario_team_structure;

COMMIT;
