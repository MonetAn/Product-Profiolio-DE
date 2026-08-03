-- Страница аллокаций не должна раскрывать численность команд
-- и персональные данные, из которых её можно восстановить.
-- Значения не удаляем: скрываем их от клиента аллокаций.

CREATE OR REPLACE FUNCTION public.get_location_allocation_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_team_metrics jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  SELECT snapshot.payload
  INTO v_payload
  FROM public.location_allocation_workspace_snapshot snapshot
  WHERE snapshot.singleton;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Allocation workspace snapshot is not initialized';
  END IF;

  SELECT COALESCE(
    jsonb_agg(metric.item - 'people_count_override' ORDER BY metric.ordinal),
    '[]'::jsonb
  )
  INTO v_team_metrics
  FROM jsonb_array_elements(
    COALESCE(v_payload -> 'team_metrics', '[]'::jsonb)
  ) WITH ORDINALITY AS metric(item, ordinal);

  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(v_payload, '{people}', '[]'::jsonb, true),
      '{assignments}',
      '[]'::jsonb,
      true
    ),
    '{team_metrics}',
    v_team_metrics,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_allocation_workspace()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_allocation_workspace()
  TO authenticated;

COMMENT ON FUNCTION public.get_location_allocation_workspace() IS
  'Самостоятельный снимок аллокаций без персональных данных и численности команд.';

-- PostgREST может читать только поля сценария, которые нужны
-- для показа и редактирования. people_count не выдаётся.
REVOKE SELECT ON public.location_allocation_scenario_teams
  FROM authenticated;
GRANT SELECT (
  id,
  unit,
  source_unit,
  source_team,
  name,
  description,
  fot_2025_rub,
  fot_2026_rub,
  run_percent,
  run_description,
  sort_order,
  is_archived
)
ON public.location_allocation_scenario_teams TO authenticated;

REVOKE SELECT ON public.location_allocation_team_metrics
  FROM authenticated;
GRANT SELECT (
  unit,
  team,
  fot_2025_rub,
  fot_2026_rub,
  unit_display_name,
  team_display_name,
  run_percent_override,
  updated_by_name,
  updated_at
)
ON public.location_allocation_team_metrics TO authenticated;
