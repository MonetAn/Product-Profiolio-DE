-- super_admin role, sensitive_scopes, RLS updates, get_my_access / get_my_scope / current_user_is_admin

-- 1) Role: allow super_admin
ALTER TABLE public.allowed_users DROP CONSTRAINT IF EXISTS allowed_users_role_check;
ALTER TABLE public.allowed_users
  ADD CONSTRAINT allowed_users_role_check
  CHECK (role IN ('user', 'admin', 'super_admin'));

-- 2) normalize_team_name (align with app: empty -> "Без команды")
CREATE OR REPLACE FUNCTION public.normalize_team_name(p_team text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_team IS NULL OR btrim(p_team) = '' THEN 'Без команды'
    ELSE btrim(p_team)
  END;
$$;

-- 3) Sensitive scopes: team NULL = entire unit is sensitive
CREATE TABLE IF NOT EXISTS public.sensitive_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL,
  team text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sensitive_scopes_unit_whole_uq
  ON public.sensitive_scopes (unit)
  WHERE team IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sensitive_scopes_unit_team_uq
  ON public.sensitive_scopes (unit, team)
  WHERE team IS NOT NULL;

COMMENT ON TABLE public.sensitive_scopes IS 'Скрытые с юнит/команда: team NULL = весь юнит. Видимость только у super_admin в данных; UI-фильтр на дашборде отдельно.';

ALTER TABLE public.sensitive_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins full access to sensitive_scopes" ON public.sensitive_scopes;

-- Only super_admins manage rows (SECURITY DEFINER helpers bypass RLS on allowed_users)
CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      AND a.role = 'super_admin'
  );
$$;

CREATE POLICY "Super admins full access to sensitive_scopes"
  ON public.sensitive_scopes FOR ALL TO authenticated
  USING (public.current_user_is_super_admin())
  WITH CHECK (public.current_user_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensitive_scopes TO authenticated;

CREATE OR REPLACE FUNCTION public.is_sensitive_unit_team(p_unit text, p_team text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sensitive_scopes s
    WHERE s.unit IS NOT DISTINCT FROM p_unit
      AND (
        s.team IS NULL
        OR s.team = public.normalize_team_name(p_team)
      )
  );
$$;

-- 4) Admins and super_admins = «админские» привилегии (активность, настройки, allowed_users)
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      AND a.role IN ('admin', 'super_admin')
  );
$$;

-- 5) get_my_scope: full access for admin and super_admin
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
        WHEN a.role IN ('admin', 'super_admin') THEN '{"see_all": true}'::json
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

-- 6) Visibility including sensitive (for RLS)
CREATE OR REPLACE FUNCTION public.user_can_see_row_with_sensitive(p_unit text, p_team text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_can_see_unit_team(p_unit, p_team)
    AND (
      public.current_user_is_super_admin()
      OR NOT public.is_sensitive_unit_team(p_unit, p_team)
    );
$$;

-- 7) RLS policies — replace unit/team visibility with sensitive-aware helper
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;
CREATE POLICY "Allowed users only" ON public.initiatives
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

DROP POLICY IF EXISTS "Allowed users only" ON public.people;
CREATE POLICY "Allowed users only" ON public.people
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

DROP POLICY IF EXISTS "Allowed users only" ON public.team_quarter_snapshots;
CREATE POLICY "Allowed users only" ON public.team_quarter_snapshots
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

DROP POLICY IF EXISTS "Allowed users only" ON public.person_initiative_assignments;
CREATE POLICY "Allowed users only" ON public.person_initiative_assignments
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_initiative_assignments.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = person_initiative_assignments.person_id
        AND public.user_can_see_row_with_sensitive(p.unit, p.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_initiative_assignments.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = person_initiative_assignments.person_id
        AND public.user_can_see_row_with_sensitive(p.unit, p.team)
    )
  );

DROP POLICY IF EXISTS "Allowed users only" ON public.initiative_history;
CREATE POLICY "Allowed users only" ON public.initiative_history
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_history.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_history.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
  );

DROP POLICY IF EXISTS "Allowed users only" ON public.person_assignment_history;
CREATE POLICY "Allowed users only" ON public.person_assignment_history
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_assignment_history.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND initiative_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = person_assignment_history.initiative_id
        AND public.user_can_see_row_with_sensitive(i.unit, i.team)
    )
  );

-- 8) get_my_access — is_super_admin, is_admin for admin+super_admin
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
        'is_admin', (a.role IN ('admin', 'super_admin')),
        'is_super_admin', (a.role = 'super_admin'),
        'can_view_money', (a.role IN ('admin', 'super_admin') OR COALESCE(a.can_view_money, true)),
        'display_name', a.display_name,
        'member_unit', a.member_unit,
        'member_team', a.member_team,
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false, "is_super_admin": false, "can_view_money": true, "display_name": null, "member_unit": null, "member_team": null, "scope": {"see_all": true}}'::json
  );
$$;

-- 9) allowed_users policies: allow super_admin same as admin
DROP POLICY IF EXISTS "Admins can read all" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can insert" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can update" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can delete" ON public.allowed_users;

CREATE POLICY "Admins can read all" ON public.allowed_users
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can insert" ON public.allowed_users
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can update" ON public.allowed_users
  FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (true);

CREATE POLICY "Admins can delete" ON public.allowed_users
  FOR DELETE TO authenticated
  USING (public.current_user_is_admin());
