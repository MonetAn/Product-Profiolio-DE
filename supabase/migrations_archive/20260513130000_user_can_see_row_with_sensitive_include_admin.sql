-- Расширяет RLS по «чувствительным» юнитам/командам (sensitive_scopes):
-- раньше только super_admin; добавляем role admin (как в current_user_is_admin()).
-- Применять, если после fix soft-delete (ALTER POLICY … WITH CHECK) у admin всё ещё 403
-- на initiatives/people/snapshots, а super_admin без ошибок — часто значит sensitive_scopes.
--
-- Не применять, если чувствительные данные должны видеть только super_admin:
-- тогда лишнее в sensitive_scopes лучше удалить вручную (DELETE …).

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
      OR public.current_user_is_admin()
      OR NOT public.is_sensitive_unit_team(p_unit, p_team)
    );
$$;
