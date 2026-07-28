-- Аллокации используют тот же активный набор, что и основной дашборд.
-- Live-набор редактируется, snapshot возвращается только для чтения.

CREATE OR REPLACE FUNCTION public.get_location_allocation_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_dataset public.portfolio_datasets%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  SELECT *
  INTO v_dataset
  FROM public.portfolio_datasets
  WHERE is_active
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_dataset.id IS NOT NULL AND v_dataset.kind = 'snapshot' THEN
    v_payload := COALESCE(v_dataset.payload, '{}'::jsonb);

    RETURN jsonb_build_object(
      'dataset',
      jsonb_build_object(
        'id', v_dataset.id,
        'code', v_dataset.code,
        'label', v_dataset.label,
        'kind', v_dataset.kind,
        'period_start', v_dataset.period_start,
        'period_end', v_dataset.period_end,
        'snapshot_at', v_dataset.snapshot_at,
        'notes', v_dataset.notes
      ),
      'read_only', true,
      'initiatives',
      COALESCE(v_payload -> 'initiatives', '[]'::jsonb),
      'portfolio_meta',
      COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'initiative_portfolio_meta', '[]'::jsonb)
        ) AS item
        WHERE COALESCE((item ->> 'is_portfolio_completed')::boolean, false)
      ), '[]'::jsonb),
      'people',
      COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'people', '[]'::jsonb)
        ) AS item
        WHERE COALESCE(item ->> 'deleted_at', '') = ''
      ), '[]'::jsonb),
      'assignments',
      COALESCE(
        v_payload -> 'person_initiative_assignments',
        '[]'::jsonb
      ),
      'countries',
      COALESCE((
        SELECT jsonb_agg(item ORDER BY item ->> 'sort_order', item ->> 'label_ru')
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'market_countries', '[]'::jsonb)
        ) AS item
        WHERE COALESCE((item ->> 'is_active')::boolean, true)
      ), '[]'::jsonb),
      'team_metrics',
      COALESCE(
        v_payload -> 'location_allocation_team_metrics',
        '[]'::jsonb
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'dataset',
    jsonb_build_object(
      'id', v_dataset.id,
      'code', COALESCE(v_dataset.code, 'live'),
      'label', COALESCE(v_dataset.label, 'Текущие данные'),
      'kind', 'live',
      'period_start', v_dataset.period_start,
      'period_end', v_dataset.period_end,
      'snapshot_at', v_dataset.snapshot_at,
      'notes', v_dataset.notes
    ),
    'read_only', false,
    'initiatives',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.unit, i.team, i.initiative, i.id)
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
    ), '[]'::jsonb),
    'portfolio_meta',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.initiative_portfolio_meta m
      WHERE m.is_portfolio_completed = true
    ), '[]'::jsonb),
    'people',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'unit', p.unit,
          'team', p.team,
          'terminated_at', p.terminated_at
        )
        ORDER BY p.full_name, p.id
      )
      FROM public.people p
      WHERE p.deleted_at IS NULL
    ), '[]'::jsonb),
    'assignments',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'person_id', a.person_id,
          'initiative_id', a.initiative_id,
          'quarterly_effort', a.quarterly_effort,
          'is_auto', a.is_auto,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )
      )
      FROM public.person_initiative_assignments a
    ), '[]'::jsonb),
    'countries',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, c.label_ru, c.id)
      FROM public.market_countries c
      WHERE c.is_active = true
    ), '[]'::jsonb),
    'team_metrics',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.unit, m.team)
      FROM public.location_allocation_team_metrics m
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_allocation_workspace()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_allocation_workspace()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_location_allocation_geo_split(
  p_initiative_id uuid,
  p_geo_cost_split jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.portfolio_datasets
    WHERE is_active
      AND kind = 'snapshot'
  ) THEN
    RAISE EXCEPTION 'historical_dataset_read_only'
      USING ERRCODE = '25006';
  END IF;

  UPDATE public.initiatives
  SET
    geo_cost_split = CASE
      WHEN p_geo_cost_split IS NULL
        OR p_geo_cost_split = 'null'::jsonb
        OR p_geo_cost_split = '{}'::jsonb
      THEN NULL
      ELSE p_geo_cost_split
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_initiative_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_location_allocation_workspace() IS
  'Аллокации из общего активного portfolio dataset. Snapshot возвращается с read_only=true.';
