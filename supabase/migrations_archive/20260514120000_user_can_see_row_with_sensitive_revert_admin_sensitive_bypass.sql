-- Цель: admin (и user) — только не-sensitive; super_admin — всё.
-- user_can_see_unit_team для role admin/super_admin даёт see_all → любые не-sensitive юниты.
-- Убираем ветку OR current_user_is_admin() из 20260513130000 — она открывала и sensitive.

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
