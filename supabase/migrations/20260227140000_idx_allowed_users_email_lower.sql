-- Speed up get_my_access() / get_my_scope() lookups by email (LOWER(email)).
-- get_my_scope and get_my_access both use: WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')

CREATE INDEX IF NOT EXISTS idx_allowed_users_email_lower
  ON public.allowed_users (LOWER(email));
