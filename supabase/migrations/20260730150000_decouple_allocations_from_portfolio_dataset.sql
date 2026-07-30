-- Вкладка «Аллокации» получает одноразовый снимок текущих данных и дальше
-- живёт независимо от активного набора портфеля и рабочих таблиц.

CREATE TABLE IF NOT EXISTS public.location_allocation_workspace_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.location_allocation_workspace_snapshot IS
  'Самостоятельная копия бюджета, таймлайна, кластеров, людей и команд для работы вкладки аллокаций.';

ALTER TABLE public.location_allocation_workspace_snapshot
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.location_allocation_workspace_snapshot
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.location_allocation_workspace_snapshot TO service_role;

CREATE OR REPLACE FUNCTION public.build_location_allocation_workspace_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_live_dataset public.portfolio_datasets%ROWTYPE;
  v_captured_at timestamptz := timezone('utc'::text, now());
BEGIN
  SELECT *
  INTO v_live_dataset
  FROM public.portfolio_datasets
  WHERE kind = 'live'
  ORDER BY
    CASE WHEN code = 'live' THEN 0 ELSE 1 END,
    snapshot_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'dataset',
    jsonb_build_object(
      'id', NULL,
      'code', 'allocations-snapshot',
      'label', 'Снимок аллокаций',
      'kind', 'live',
      'period_start', v_live_dataset.period_start,
      'period_end', v_live_dataset.period_end,
      'snapshot_at', v_captured_at,
      'notes', 'Самостоятельный рабочий снимок вкладки аллокаций'
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

REVOKE ALL ON FUNCTION public.build_location_allocation_workspace_snapshot()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_location_allocation_workspace_snapshot()
  TO service_role;

-- Снимок создаётся ровно один раз. Повторное применение миграции или будущие
-- изменения портфеля не заменят уже сохранённое состояние аллокаций.
INSERT INTO public.location_allocation_workspace_snapshot (
  singleton,
  payload
)
VALUES (
  true,
  public.build_location_allocation_workspace_snapshot()
)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_location_allocation_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
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

  RETURN v_payload;
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
DECLARE
  v_geo_cost_split jsonb := CASE
    WHEN p_geo_cost_split IS NULL
      OR p_geo_cost_split = 'null'::jsonb
      OR p_geo_cost_split = '{}'::jsonb
    THEN 'null'::jsonb
    ELSE p_geo_cost_split
  END;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  UPDATE public.location_allocation_workspace_snapshot AS snapshot
  SET
    payload = jsonb_set(
      snapshot.payload,
      '{initiatives}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN initiative.item ->> 'id' = p_initiative_id::text
            THEN jsonb_set(
              jsonb_set(
                initiative.item,
                '{geo_cost_split}',
                v_geo_cost_split,
                true
              ),
              '{updated_at}',
              to_jsonb(timezone('utc'::text, now())),
              true
            )
            ELSE initiative.item
          END
          ORDER BY initiative.ordinal
        )
        FROM jsonb_array_elements(
          COALESCE(snapshot.payload -> 'initiatives', '[]'::jsonb)
        ) WITH ORDINALITY AS initiative(item, ordinal)
      ),
      false
    ),
    updated_at = timezone('utc'::text, now())
  WHERE snapshot.singleton
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(snapshot.payload -> 'initiatives', '[]'::jsonb)
      ) AS initiative(item)
      WHERE initiative.item ->> 'id' = p_initiative_id::text
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation initiative not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_location_allocation_initiative_tags(
  p_initiative_id uuid,
  p_tags text[]
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

  UPDATE public.location_allocation_workspace_snapshot AS snapshot
  SET
    payload = jsonb_set(
      snapshot.payload,
      '{initiatives}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN initiative.item ->> 'id' = p_initiative_id::text
            THEN jsonb_set(
              jsonb_set(
                initiative.item,
                '{tags}',
                to_jsonb(COALESCE(p_tags, '{}'::text[])),
                true
              ),
              '{updated_at}',
              to_jsonb(timezone('utc'::text, now())),
              true
            )
            ELSE initiative.item
          END
          ORDER BY initiative.ordinal
        )
        FROM jsonb_array_elements(
          COALESCE(snapshot.payload -> 'initiatives', '[]'::jsonb)
        ) WITH ORDINALITY AS initiative(item, ordinal)
      ),
      false
    ),
    updated_at = timezone('utc'::text, now())
  WHERE snapshot.singleton
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(snapshot.payload -> 'initiatives', '[]'::jsonb)
      ) AS initiative(item)
      WHERE initiative.item ->> 'id' = p_initiative_id::text
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation initiative not found';
  END IF;
END;
$$;

REVOKE ALL
  ON FUNCTION public.set_location_allocation_initiative_tags(uuid, text[])
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.set_location_allocation_initiative_tags(uuid, text[])
  TO authenticated;

COMMENT ON FUNCTION public.get_location_allocation_workspace() IS
  'Одноразовый самостоятельный снимок вкладки аллокаций, не связанный с активным portfolio dataset.';
