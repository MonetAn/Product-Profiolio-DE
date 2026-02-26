-- Access control: whitelist and roles
-- Run in Supabase Dashboard → SQL Editor after the base schema (supabase-schema.sql).
-- Then add your first admin manually: INSERT INTO public.allowed_users (email, role) VALUES ('a.monetov@dodobrands.io', 'admin');

-- Table: who can access the app and their role
CREATE TABLE IF NOT EXISTS public.allowed_users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row (to know they have access). Admins can read all and manage.
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

-- RPC: returns only current user's access (no list). Safe for non-admins.
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

-- Restrict other tables to whitelisted users only (replace previous "Allow all for authenticated")
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.initiatives;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.people;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.person_initiative_assignments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.initiative_history;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.person_assignment_history;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.team_quarter_snapshots;

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
