-- Scoped access: get_my_scope(), user_can_see_unit_team(), and RLS policies.
-- Run after 20260227120000_scoped_access_allowed_users.sql.

-- 1) get_my_scope(): returns { see_all: true } or { see_all: false, allowed_units: [...], allowed_team_pairs: [...] }
--    Admin or empty scope => see_all. Used by RLS and get_my_access().
CREATE OR REPLACE FUNCTION public.get_my_scope()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN a.role = 'admin' THEN '{"see_all": true}'::json
        WHEN (a.allowed_units IS NULL OR a.allowed_units = '{}')
         AND (a.allowed_team_pairs IS NULL OR a.allowed_team_pairs = '[]'::jsonb)
        THEN '{"see_all": true}'::json
        ELSE json_build_object(
          'see_all', false,
          'allowed_units', COALESCE(a.allowed_units, '{}'),
          'allowed_team_pairs', COALESCE(a.allowed_team_pairs, '[]'::jsonb)
        )
      END
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"see_all": true}'::json
  );
$$;

-- 2) user_can_see_unit_team(p_unit text, p_team text): true if current user's scope includes this (unit, team).
--    NULL unit/team: only visible when see_all.
CREATE OR REPLACE FUNCTION public.user_can_see_unit_team(p_unit text, p_team text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  scope json;
  elem jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RETURN false;
  END IF;
  scope := public.get_my_scope();
  IF (scope->>'see_all')::boolean = true THEN
    RETURN true;
  END IF;
  IF p_unit IS NULL AND p_team IS NULL THEN
    RETURN false;
  END IF;
  IF p_unit IS NOT NULL AND (scope->'allowed_units') @> to_jsonb(p_unit) THEN
    RETURN true;
  END IF;
  IF p_unit IS NOT NULL AND p_team IS NOT NULL THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(scope->'allowed_team_pairs')
    LOOP
      IF (elem->>'unit') IS NOT DISTINCT FROM p_unit AND (elem->>'team') IS NOT DISTINCT FROM p_team THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

-- 3) RLS: initiatives — filter by unit/team scope
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;
CREATE POLICY "Allowed users only" ON public.initiatives
  FOR ALL TO authenticated
  USING (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team))
  WITH CHECK (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team));

-- 4) RLS: people — filter by unit/team scope (people.unit/team can be null)
DROP POLICY IF EXISTS "Allowed users only" ON public.people;
CREATE POLICY "Allowed users only" ON public.people
  FOR ALL TO authenticated
  USING (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team))
  WITH CHECK (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team));

-- 5) RLS: team_quarter_snapshots
DROP POLICY IF EXISTS "Allowed users only" ON public.team_quarter_snapshots;
CREATE POLICY "Allowed users only" ON public.team_quarter_snapshots
  FOR ALL TO authenticated
  USING (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team))
  WITH CHECK (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team));

-- 6) RLS: person_initiative_assignments — visible if both initiative and person are in scope
DROP POLICY IF EXISTS "Allowed users only" ON public.person_initiative_assignments;
CREATE POLICY "Allowed users only" ON public.person_initiative_assignments
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_initiative_assignments.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = person_initiative_assignments.person_id
      AND public.user_can_see_unit_team(p.unit, p.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_initiative_assignments.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = person_initiative_assignments.person_id
      AND public.user_can_see_unit_team(p.unit, p.team)
    )
  );

-- 7) RLS: initiative_history — visible if linked initiative is in scope (null initiative_id = hidden for restricted)
DROP POLICY IF EXISTS "Allowed users only" ON public.initiative_history;
CREATE POLICY "Allowed users only" ON public.initiative_history
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_history.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_history.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  );

-- 8) RLS: person_assignment_history — visible if linked initiative is in scope (null initiative_id = hidden)
DROP POLICY IF EXISTS "Allowed users only" ON public.person_assignment_history;
CREATE POLICY "Allowed users only" ON public.person_assignment_history
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_assignment_history.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_assignment_history.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  );

-- profiles: keep simple whitelist (no unit/team on profiles)
-- Already using current_user_has_access() if applied via supabase-fix-rls-recursion.sql; no change.

-- 9) get_my_access(): extend response with scope for frontend (see_all / allowed_units / allowed_team_pairs)
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
        'is_admin', (a.role = 'admin'),
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false, "scope": {"see_all": true}}'::json
  );
$$;
