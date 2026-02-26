-- Fix: compare email case-insensitively (Google JWT may return A.Monetov@... while DB has a.monetov@...)
-- Run in Supabase SQL Editor once.

-- 1) Normalize existing emails to lowercase
UPDATE public.allowed_users SET email = LOWER(email) WHERE email != LOWER(email);

-- 2) allowed_users: re-create policies with LOWER()
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
  USING (
    EXISTS (
      SELECT 1 FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email') AND a.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert" ON public.allowed_users
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email') AND a.role = 'admin'
    )
  );

CREATE POLICY "Admins can update" ON public.allowed_users
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email') AND a.role = 'admin'
    )
  )
  WITH CHECK (true);

CREATE POLICY "Admins can delete" ON public.allowed_users
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email') AND a.role = 'admin'
    )
  );

-- 3) get_my_access: compare with LOWER
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT json_build_object(
        'can_access', true,
        'is_admin', (a.role = 'admin')
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false}'::json
  );
$$;

-- 4) Other tables: "Allowed users only" with LOWER
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;
DROP POLICY IF EXISTS "Allowed users only" ON public.people;
DROP POLICY IF EXISTS "Allowed users only" ON public.person_initiative_assignments;
DROP POLICY IF EXISTS "Allowed users only" ON public.initiative_history;
DROP POLICY IF EXISTS "Allowed users only" ON public.person_assignment_history;
DROP POLICY IF EXISTS "Allowed users only" ON public.profiles;
DROP POLICY IF EXISTS "Allowed users only" ON public.team_quarter_snapshots;

CREATE POLICY "Allowed users only" ON public.initiatives
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.people
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.person_initiative_assignments
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.initiative_history
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.person_assignment_history
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.profiles
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);

CREATE POLICY "Allowed users only" ON public.team_quarter_snapshots
  FOR ALL TO authenticated
  USING ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL)
  WITH CHECK ((SELECT 1 FROM public.allowed_users a WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')) IS NOT NULL);
