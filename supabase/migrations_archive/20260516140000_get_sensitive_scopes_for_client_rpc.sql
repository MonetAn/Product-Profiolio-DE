-- Маска sensitive для тримапа: admin/super_admin получают строки; обычный user — пусто.
-- Читает таблицу под DEFINER; доступ ограничен проверкой current_user_is_admin().

CREATE OR REPLACE FUNCTION public.get_sensitive_scopes_for_client()
RETURNS TABLE (unit text, team text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.unit, s.team
  FROM public.sensitive_scopes s
  WHERE public.current_user_is_admin();
$$;

REVOKE ALL ON FUNCTION public.get_sensitive_scopes_for_client() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sensitive_scopes_for_client() TO authenticated;
