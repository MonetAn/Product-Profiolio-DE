-- Переименование, удаление, создание и изменение порядка команд в сценарии
-- доступны всем пользователям, добавленным в «Доступы».

CREATE OR REPLACE FUNCTION public.current_user_can_manage_allocation_scenario_teams()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowed_users allowed
    WHERE lower(allowed.email) =
      lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
$$;

COMMENT ON FUNCTION public.current_user_can_manage_allocation_scenario_teams() IS
  'Любой пользователь из allowed_users может создавать, переименовывать, перемещать и удалять команды сценария аллокаций.';

REVOKE ALL
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.current_user_can_manage_allocation_scenario_teams()
  TO authenticated;

-- Существующий объединённый юнит становится Data Office вместе со всеми
-- командами и показателями. AI Hub остаётся отдельным пустым юнитом.
-- Служебное подключение мигратора не содержит пользовательский JWT, поэтому
-- на время системного переименования отключаем только структурный guard.
ALTER TABLE public.location_allocation_scenario_teams
  DISABLE TRIGGER trg_guard_allocation_scenario_team_structure;

UPDATE public.location_allocation_scenario_teams
SET
  unit = 'Data Office',
  updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office + AI Hub';

ALTER TABLE public.location_allocation_scenario_teams
  ENABLE TRIGGER trg_guard_allocation_scenario_team_structure;

UPDATE public.allowed_users
SET allocation_editor_units = array_replace(
  allocation_editor_units,
  'Data Office + AI Hub',
  'Data Office'
)
WHERE 'Data Office + AI Hub' = ANY(allocation_editor_units);

-- AI Hub существует как пустой юнит в клиентском каталоге. Отдельная строка
-- в БД появится только при создании первой команды, поэтому суммы и люди
-- из других юнитов в него не переносятся.
COMMENT ON COLUMN public.allowed_users.allocation_editor_units IS
  'Редактируемые юниты сценария: App&Web, B2B Pizza, Client Platform, Data Office, AI Hub, Tech Platform. Поле сохранено для совместимости; редактирование открыто всем пользователям из allowed_users.';
