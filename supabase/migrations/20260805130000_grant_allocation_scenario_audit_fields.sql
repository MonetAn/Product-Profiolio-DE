-- Экспорт аллокаций включает автора и время последнего обновления команды.
-- После ограничения column-level SELECT эти два поля не были доступны
-- authenticated, из-за чего PostgREST отклонял весь запрос к таблице.

GRANT SELECT (
  updated_by_name,
  updated_at
)
ON public.location_allocation_scenario_teams TO authenticated;
