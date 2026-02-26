-- Fix: infinite recursion in RLS (policies on allowed_users queried allowed_users again).
-- Use SECURITY DEFINER functions so the check runs without RLS.
-- Run in Supabase SQL Editor once.

-- 1) Function: is current user in allowed_users? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.current_user_has_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
  );
$$;

-- 2) Function: is current user an admin in allowed_users? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.current_user_is_allowed_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email') AND a.role = 'admin'
  );
$$;

-- 3) allowed_users: drop policies that cause recursion, recreate using the function
DROP POLICY IF EXISTS "Users can read own row" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can read all" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can insert" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can update" ON public.allowed_users;
DROP POLICY IF EXISTS "Admins can delete" ON public.allowed_users;

CREATE POLICY "Users can read own row" ON public.allowed_users
  FOR SELECT TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

CREATE POLICY "Admins can read all" ON public.allowed_users
  FOR SELECT TO authenticated
  USING (public.current_user_is_allowed_admin());

CREATE POLICY "Admins can insert" ON public.allowed_users
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_allowed_admin());

CREATE POLICY "Admins can update" ON public.allowed_users
  FOR UPDATE TO authenticated
  USING (public.current_user_is_allowed_admin())
  WITH CHECK (true);

CREATE POLICY "Admins can delete" ON public.allowed_users
  FOR DELETE TO authenticated
  USING (public.current_user_is_allowed_admin());

-- 4) Other tables: use function instead of subquery (avoids recursion when they read allowed_users)
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;
DROP POLICY IF EXISTS "Allowed users only" ON public.people;
DROP POLICY IF EXISTS "Allowed users only" ON public.person_initiative_assignments;
DROP POLICY IF EXISTS "Allowed users only" ON public.initiative_history;
DROP POLICY IF EXISTS "Allowed users only" ON public.person_assignment_history;
DROP POLICY IF EXISTS "Allowed users only" ON public.profiles;
DROP POLICY IF EXISTS "Allowed users only" ON public.team_quarter_snapshots;

CREATE POLICY "Allowed users only" ON public.initiatives
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.people
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.person_initiative_assignments
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.initiative_history
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.person_assignment_history
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

CREATE POLICY "Allowed users only" ON public.team_quarter_snapshots
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());
