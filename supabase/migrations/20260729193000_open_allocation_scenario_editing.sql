-- Все пользователи, добавленные в «Доступы», могут редактировать содержимое
-- сценария аллокаций во всех юнитах. Структурные действия с командами временно
-- остаются только у a.monetov@dodobrands.io.

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
    WHERE lower(allowed.email) =
      lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
$$;

COMMENT ON FUNCTION public.current_user_can_edit_allocation_scenario(text) IS
  'Любой пользователь из allowed_users может редактировать содержимое сценария аллокаций во всех юнитах.';

CREATE OR REPLACE FUNCTION public.current_user_can_manage_allocation_scenario_teams()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT lower(trim(COALESCE(auth.jwt() ->> 'email', ''))) =
    'a.monetov@dodobrands.io';
$$;

REVOKE ALL
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_allocation_scenario_team_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_can_manage_allocation_scenario_teams() THEN
    RETURN NEW;
  END IF;

  IF
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.source_unit IS DISTINCT FROM OLD.source_unit
    OR NEW.source_team IS DISTINCT FROM OLD.source_team
    OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
  THEN
    RAISE EXCEPTION
      'Only the allocation scenario team manager can change team structure'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.guard_allocation_scenario_team_structure()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_allocation_scenario_team_structure
  ON public.location_allocation_scenario_teams;
CREATE TRIGGER trg_guard_allocation_scenario_team_structure
  BEFORE UPDATE ON public.location_allocation_scenario_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_allocation_scenario_team_structure();

DROP POLICY IF EXISTS "Allocation editors add scenario teams"
  ON public.location_allocation_scenario_teams;
CREATE POLICY "Allocation manager adds scenario teams"
  ON public.location_allocation_scenario_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_manage_allocation_scenario_teams()
    OR (
      source_unit IS NOT NULL
      AND source_team IS NOT NULL
      AND public.allocation_scenario_is_empty()
      AND public.current_user_can_edit_allocation_scenario(unit)
    )
  );

DROP POLICY IF EXISTS "Allocation editors delete scenario teams"
  ON public.location_allocation_scenario_teams;
CREATE POLICY "Allocation manager deletes scenario teams"
  ON public.location_allocation_scenario_teams
  FOR DELETE TO authenticated
  USING (public.current_user_can_manage_allocation_scenario_teams());
