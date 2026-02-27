-- Scoped access: add allowed_units and allowed_team_pairs to allowed_users.
-- Empty = full access. Non-empty = user sees only listed units and (unit, team) pairs.
-- Admins always see all (handled in get_my_scope).

-- Ensure helper exists (may already exist from supabase-fix-rls-recursion.sql)
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

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS allowed_units text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_team_pairs jsonb DEFAULT '[]';

COMMENT ON COLUMN public.allowed_users.allowed_units IS 'Units user can see. Empty = no unit-based restriction (combined with empty allowed_team_pairs = see all).';
COMMENT ON COLUMN public.allowed_users.allowed_team_pairs IS 'Array of {unit, team} objects. User can see these (unit, team) pairs. Empty = no team-pair restriction.';
