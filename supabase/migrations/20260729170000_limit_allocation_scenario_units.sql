-- Сценарий презентации использует отдельный фиксированный набор юнитов.
-- Остальные сценарные строки сохраняются в базе, но не выводятся во фронте.

UPDATE public.location_allocation_scenario_teams
SET
  unit = 'Data Office + AI Hub',
  updated_at = timezone('utc'::text, now())
WHERE unit = 'Data Office';

UPDATE public.allowed_users
SET allocation_editor_units = array_remove(
  ARRAY[
    CASE
      WHEN 'App&Web' = ANY(allocation_editor_units) THEN 'App&Web'
    END,
    CASE
      WHEN 'B2B Pizza' = ANY(allocation_editor_units) THEN 'B2B Pizza'
    END,
    CASE
      WHEN 'Client Platform' = ANY(allocation_editor_units) THEN 'Client Platform'
    END,
    CASE
      WHEN
        'Data Office' = ANY(allocation_editor_units)
        OR 'Data Office + AI Hub' = ANY(allocation_editor_units)
      THEN 'Data Office + AI Hub'
    END,
    CASE
      WHEN 'Tech Platform' = ANY(allocation_editor_units) THEN 'Tech Platform'
    END
  ]::text[],
  NULL
)
WHERE allocation_editor_units <> '{}'::text[];

COMMENT ON COLUMN public.allowed_users.allocation_editor_units IS
  'Редактируемые юниты сценария: App&Web, B2B Pizza, Client Platform, Data Office + AI Hub, Tech Platform.';
