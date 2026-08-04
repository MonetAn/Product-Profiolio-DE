-- Структурные действия с командами сценария доступны только владельцу.
-- Остальные пользователи из allowed_users по-прежнему могут редактировать
-- описания, проценты и другие содержательные поля карточек.

CREATE OR REPLACE FUNCTION public.current_user_can_manage_allocation_scenario_teams()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT lower(trim(COALESCE(auth.jwt() ->> 'email', ''))) =
    'a.monetov@dodobrands.io';
$$;

COMMENT ON FUNCTION public.current_user_can_manage_allocation_scenario_teams() IS
  'Только a.monetov@dodobrands.io может создавать, переименовывать, перемещать и удалять команды сценария аллокаций.';

REVOKE ALL
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  TO authenticated;
