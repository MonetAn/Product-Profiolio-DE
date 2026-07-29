-- Редакторы презентационного сценария назначаются отдельно по юнитам.
-- Право не наследуется от роли администратора: редактировать может только
-- пользователь, которому явно отметили соответствующий юнит в «Доступах».

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS allocation_editor_units text[] NOT NULL
    DEFAULT '{}'::text[];

COMMENT ON COLUMN public.allowed_users.allocation_editor_units IS
  'Юниты, сценарий аллокаций которых пользователь может редактировать и презентовать.';

CREATE OR REPLACE FUNCTION public.current_user_can_edit_allocation_scenario(
  p_unit text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowed_users allowed
    WHERE
      lower(allowed.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      AND trim(COALESCE(p_unit, '')) = ANY(
        COALESCE(allowed.allocation_editor_units, '{}'::text[])
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_edit_allocation_scenario(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_allocation_scenario(text)
  TO authenticated;

-- Нужен только для первого автоматического импорта исходных команд.
CREATE OR REPLACE FUNCTION public.allocation_scenario_is_empty()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.location_allocation_scenario_teams
  );
$$;

REVOKE ALL ON FUNCTION public.allocation_scenario_is_empty() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocation_scenario_is_empty()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.allocation_scenario_region_bootstrap_allowed(
  p_team_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_allocation_scenario_teams team
    WHERE
      team.id = p_team_id
      AND team.source_unit IS NOT NULL
      AND team.source_team IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.location_allocation_scenario_regions region
        WHERE region.team_id = team.id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.allocation_scenario_region_bootstrap_allowed(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocation_scenario_region_bootstrap_allowed(uuid)
  TO authenticated;

-- У уже созданных команд сразу появляются все четыре постоянных направления:
-- RUN хранится в строке команды, три региона — отдельными строками.
INSERT INTO public.location_allocation_scenario_regions (
  team_id,
  region,
  sort_order
)
SELECT
  team.id,
  region.name,
  region.sort_order
FROM public.location_allocation_scenario_teams team
CROSS JOIN (
  VALUES
    ('Domestic Region'::text, 0),
    ('International Region'::text, 1),
    ('Drink It'::text, 2)
) AS region(name, sort_order)
ON CONFLICT (team_id, region) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users write allocation scenario teams"
  ON public.location_allocation_scenario_teams;
DROP POLICY IF EXISTS "Allocation editors add scenario teams"
  ON public.location_allocation_scenario_teams;
DROP POLICY IF EXISTS "Allocation editors update scenario teams"
  ON public.location_allocation_scenario_teams;
DROP POLICY IF EXISTS "Allocation editors delete scenario teams"
  ON public.location_allocation_scenario_teams;

CREATE POLICY "Allocation editors add scenario teams"
  ON public.location_allocation_scenario_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_edit_allocation_scenario(unit)
    OR (
      source_unit IS NOT NULL
      AND source_team IS NOT NULL
      AND public.allocation_scenario_is_empty()
    )
  );

CREATE POLICY "Allocation editors update scenario teams"
  ON public.location_allocation_scenario_teams
  FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_allocation_scenario(unit))
  WITH CHECK (public.current_user_can_edit_allocation_scenario(unit));

CREATE POLICY "Allocation editors delete scenario teams"
  ON public.location_allocation_scenario_teams
  FOR DELETE TO authenticated
  USING (public.current_user_can_edit_allocation_scenario(unit));

DROP POLICY IF EXISTS "Authenticated users write allocation scenario regions"
  ON public.location_allocation_scenario_regions;
DROP POLICY IF EXISTS "Allocation editors add scenario regions"
  ON public.location_allocation_scenario_regions;
DROP POLICY IF EXISTS "Allocation editors update scenario regions"
  ON public.location_allocation_scenario_regions;
DROP POLICY IF EXISTS "Allocation editors delete scenario regions"
  ON public.location_allocation_scenario_regions;

CREATE POLICY "Allocation editors add scenario regions"
  ON public.location_allocation_scenario_regions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.location_allocation_scenario_teams team
      WHERE
        team.id = team_id
        AND public.current_user_can_edit_allocation_scenario(team.unit)
    )
    OR public.allocation_scenario_region_bootstrap_allowed(team_id)
  );

CREATE POLICY "Allocation editors update scenario regions"
  ON public.location_allocation_scenario_regions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.location_allocation_scenario_teams team
      WHERE
        team.id = team_id
        AND public.current_user_can_edit_allocation_scenario(team.unit)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.location_allocation_scenario_teams team
      WHERE
        team.id = team_id
        AND public.current_user_can_edit_allocation_scenario(team.unit)
    )
  );

CREATE POLICY "Allocation editors delete scenario regions"
  ON public.location_allocation_scenario_regions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.location_allocation_scenario_teams team
      WHERE
        team.id = team_id
        AND public.current_user_can_edit_allocation_scenario(team.unit)
    )
  );

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT json_build_object(
        'can_access', true,
        'is_admin', (allowed.role IN ('admin', 'super_admin')),
        'is_super_admin', (allowed.role = 'super_admin'),
        'has_early_access', COALESCE(allowed.early_access, false),
        'can_view_money', (
          allowed.role IN ('admin', 'super_admin')
          OR COALESCE(allowed.can_view_money, true)
        ),
        'display_name', allowed.display_name,
        'member_unit', allowed.member_unit,
        'member_team', allowed.member_team,
        'member_affiliations', COALESCE(
          allowed.member_affiliations,
          '[]'::jsonb
        ),
        'allocation_editor_units', COALESCE(
          allowed.allocation_editor_units,
          '{}'::text[]
        ),
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users allowed
      WHERE
        lower(allowed.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      LIMIT 1
    ),
    '{
      "can_access": false,
      "is_admin": false,
      "is_super_admin": false,
      "has_early_access": false,
      "can_view_money": true,
      "display_name": null,
      "member_unit": null,
      "member_team": null,
      "member_affiliations": [],
      "allocation_editor_units": [],
      "scope": {"see_all": true}
    }'::json
  );
$$;
