-- =============================================================================
-- public.is_dodo_employee() — требуется для RLS на initiative_budget_department_2026
-- и других таблицах (политики «Dodo employees can …»).
--
-- Если в SQL Editor ошибка: function public.is_dodo_employee() does not exist —
-- выполните этот файл один раз (или он уже включён в *-one-paste-with-rules.sql).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_dodo_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'email') ILIKE '%@dodobrands.io',
    false
  );
$$;

COMMENT ON FUNCTION public.is_dodo_employee() IS 'RLS: email в JWT оканчивается на @dodobrands.io';

GRANT EXECUTE ON FUNCTION public.is_dodo_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dodo_employee() TO anon;
GRANT EXECUTE ON FUNCTION public.is_dodo_employee() TO service_role;
