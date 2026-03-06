-- Add can_view_money to allowed_users. When false, user cannot see money anywhere and has no toggle.
-- Admins always see money (can_view_money not applied to them in get_my_access).

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS can_view_money boolean DEFAULT true;

COMMENT ON COLUMN public.allowed_users.can_view_money IS 'If false, user never sees budget/cost amounts and has no money toggle. Admins always see money.';

-- Update get_my_access() to return can_view_money (true for admin, else from column).
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
        'can_view_money', (a.role = 'admin' OR COALESCE(a.can_view_money, true)),
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false, "can_view_money": true, "scope": {"see_all": true}}'::json
  );
$$;
