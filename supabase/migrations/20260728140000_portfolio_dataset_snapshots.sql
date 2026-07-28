-- Полные снимки портфеля и единый активный набор для основного дашборда и public embed.
-- Live-набор всегда читает текущие таблицы. Snapshot хранит неизменяемый JSONB-срез.

CREATE TABLE IF NOT EXISTS public.portfolio_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('live', 'snapshot')),
  period_start date,
  period_end date,
  snapshot_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  notes text,
  payload jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT portfolio_datasets_payload_check CHECK (
    (kind = 'live' AND payload IS NULL)
    OR (kind = 'snapshot' AND jsonb_typeof(payload) = 'object')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_datasets_one_active_idx
  ON public.portfolio_datasets ((true))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS portfolio_datasets_snapshot_at_idx
  ON public.portfolio_datasets (snapshot_at DESC);

ALTER TABLE public.portfolio_datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view portfolio datasets" ON public.portfolio_datasets;
CREATE POLICY "Super admins view portfolio datasets"
  ON public.portfolio_datasets FOR SELECT TO authenticated
  USING (public.current_user_is_super_admin());

GRANT SELECT ON public.portfolio_datasets TO authenticated;
GRANT ALL ON public.portfolio_datasets TO service_role;

COMMENT ON TABLE public.portfolio_datasets IS
  'Один live-набор и неизменяемые полные снимки портфеля. Ровно один набор включён для дашборда и public embed.';
COMMENT ON COLUMN public.portfolio_datasets.payload IS
  'Полный снимок зависимостей дашборда: инициативы, метаданные, бюджеты, кроссы, люди, аллокации и настройки.';

INSERT INTO public.portfolio_datasets (
  code,
  label,
  kind,
  notes,
  is_active
)
VALUES (
  'live',
  'Текущие данные',
  'live',
  'Рабочий набор из актуальных таблиц',
  NOT EXISTS (SELECT 1 FROM public.portfolio_datasets WHERE is_active)
)
ON CONFLICT (code) DO NOTHING;

UPDATE public.portfolio_datasets
SET is_active = true
WHERE code = 'live'
  AND NOT EXISTS (
    SELECT 1
    FROM public.portfolio_datasets
    WHERE is_active
  );

-- Вспомогательная функция для необязательных таблиц. Не выдаётся клиентским ролям.
CREATE OR REPLACE FUNCTION public._portfolio_snapshot_table(p_table_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table regclass;
  v_result jsonb;
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Недопустимое имя таблицы';
  END IF;

  v_table := to_regclass(format('public.%I', p_table_name));
  IF v_table IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s AS t',
    v_table
  )
  INTO v_result;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public._portfolio_snapshot_table(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.build_portfolio_dataset_payload()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'schema_version', 1,
    'captured_at', timezone('utc', now()),
    'initiatives', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.unit, i.team, i.initiative, i.id)
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
    ), '[]'::jsonb),
    'initiative_portfolio_meta', public._portfolio_snapshot_table('initiative_portfolio_meta'),
    'budget_department_allocations', public._portfolio_snapshot_table('initiative_budget_department_2026'),
    'budget_anchor', public._portfolio_snapshot_table('budget_portfolio_anchor_2026'),
    'team_baselines', public._portfolio_snapshot_table('team_budget_baseline_2026'),
    'team_manual_truth', public._portfolio_snapshot_table('team_budget_manual_truth_2026'),
    'cross_initiatives', public._portfolio_snapshot_table('cross_initiatives'),
    'cross_initiative_members', public._portfolio_snapshot_table('cross_initiative_members'),
    'people', public._portfolio_snapshot_table('people'),
    'person_initiative_assignments', public._portfolio_snapshot_table('person_initiative_assignments'),
    'person_assignment_history', public._portfolio_snapshot_table('person_assignment_history'),
    'team_quarter_snapshots', public._portfolio_snapshot_table('team_quarter_snapshots'),
    'market_countries', public._portfolio_snapshot_table('market_countries'),
    'sensitive_scopes', public._portfolio_snapshot_table('sensitive_scopes'),
    'treemap_layout_config', public._portfolio_snapshot_table('dashboard_treemap_layout_config'),
    'team_effort_subgroups', public._portfolio_snapshot_table('team_effort_subgroups'),
    'team_effort_subgroup_members', public._portfolio_snapshot_table('team_effort_subgroup_members'),
    'team_subgroup_initiative_effort', public._portfolio_snapshot_table('team_subgroup_initiative_effort'),
    'location_allocation_team_metrics', public._portfolio_snapshot_table('location_allocation_team_metrics'),
    'initiative_allocation_comments', public._portfolio_snapshot_table('initiative_allocation_comments'),
    'initiative_allocation_comment_events', public._portfolio_snapshot_table('initiative_allocation_comment_events')
  );
$$;

REVOKE ALL ON FUNCTION public.build_portfolio_dataset_payload() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_portfolio_dataset_payload() TO service_role;

CREATE OR REPLACE FUNCTION public.create_portfolio_dataset_snapshot(
  p_label text,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_label text := NULLIF(btrim(p_label), '');
  v_code text;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required' USING ERRCODE = '42501';
  END IF;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Укажите название снимка';
  END IF;
  IF p_period_start IS NOT NULL
    AND p_period_end IS NOT NULL
    AND p_period_start > p_period_end
  THEN
    RAISE EXCEPTION 'Начало периода не может быть позже окончания';
  END IF;

  v_code := 'snapshot-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS');

  INSERT INTO public.portfolio_datasets (
    code,
    label,
    kind,
    period_start,
    period_end,
    notes,
    payload,
    is_active,
    created_by
  )
  VALUES (
    v_code,
    v_label,
    'snapshot',
    p_period_start,
    p_period_end,
    NULLIF(btrim(p_notes), ''),
    public.build_portfolio_dataset_payload(),
    false,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_portfolio_dataset_snapshot(text, date, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_portfolio_dataset_snapshot(text, date, date, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_active_portfolio_dataset(p_dataset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.portfolio_datasets
    WHERE id = p_dataset_id
  ) THEN
    RAISE EXCEPTION 'Набор данных не найден';
  END IF;

  UPDATE public.portfolio_datasets
  SET is_active = false
  WHERE is_active
    AND id <> p_dataset_id;

  UPDATE public.portfolio_datasets
  SET is_active = true
  WHERE id = p_dataset_id
    AND NOT is_active;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_portfolio_dataset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_portfolio_dataset(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_active_portfolio_dataset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dataset public.portfolio_datasets%ROWTYPE;
  v_payload jsonb;
  v_initiatives jsonb;
  v_allowed_ids uuid[];
  v_can_see_sensitive boolean;
BEGIN
  SELECT *
  INTO v_dataset
  FROM public.portfolio_datasets
  WHERE is_active
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_dataset.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_payload := CASE
    WHEN v_dataset.kind = 'live' THEN public.build_portfolio_dataset_payload()
    ELSE v_dataset.payload
  END;

  v_can_see_sensitive := public.current_user_is_super_admin();

  SELECT
    COALESCE(jsonb_agg(item ORDER BY item->>'unit', item->>'team', item->>'initiative'), '[]'::jsonb),
    COALESCE(array_agg((item->>'id')::uuid), ARRAY[]::uuid[])
  INTO v_initiatives, v_allowed_ids
  FROM jsonb_array_elements(COALESCE(v_payload->'initiatives', '[]'::jsonb)) AS item
  WHERE COALESCE(item->>'deleted_at', '') = ''
    AND public.user_can_see_unit_team(item->>'unit', item->>'team')
    AND (
      v_can_see_sensitive
      OR NOT public.is_sensitive_unit_team(item->>'unit', item->>'team')
    );

  RETURN jsonb_build_object(
    'dataset', jsonb_build_object(
      'id', v_dataset.id,
      'code', v_dataset.code,
      'label', v_dataset.label,
      'kind', v_dataset.kind,
      'period_start', v_dataset.period_start,
      'period_end', v_dataset.period_end,
      'snapshot_at', v_dataset.snapshot_at,
      'notes', v_dataset.notes
    ),
    'schema_version', COALESCE(v_payload->'schema_version', '1'::jsonb),
    'initiatives', v_initiatives,
    'initiative_portfolio_meta', COALESCE((
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(COALESCE(v_payload->'initiative_portfolio_meta', '[]'::jsonb)) AS item
      WHERE (item->>'initiative_id')::uuid = ANY(v_allowed_ids)
    ), '[]'::jsonb),
    'budget_department_allocations', COALESCE((
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(COALESCE(v_payload->'budget_department_allocations', '[]'::jsonb)) AS item
      WHERE (item->>'initiative_id')::uuid = ANY(v_allowed_ids)
    ), '[]'::jsonb),
    'budget_anchor', COALESCE(v_payload->'budget_anchor', '[]'::jsonb),
    'team_baselines', COALESCE((
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(COALESCE(v_payload->'team_baselines', '[]'::jsonb)) AS item
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_initiatives) AS initiative
        WHERE initiative->>'unit' = item->>'unit'
          AND initiative->>'team' = item->>'team'
      )
    ), '[]'::jsonb),
    'cross_initiatives', COALESCE(v_payload->'cross_initiatives', '[]'::jsonb),
    'cross_initiative_members', COALESCE((
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(COALESCE(v_payload->'cross_initiative_members', '[]'::jsonb)) AS item
      WHERE (item->>'initiative_id')::uuid = ANY(v_allowed_ids)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_portfolio_dataset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_portfolio_dataset()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_active_portfolio_dataset() IS
  'Согласованный активный набор для всего основного дашборда. Snapshot не читает изменившиеся live-таблицы.';

-- Public embed использует тот же глобально активный набор, но только свой юнит и без sensitive.
CREATE OR REPLACE FUNCTION public.get_public_embed_portfolio(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit text;
  v_label text;
  v_dataset public.portfolio_datasets%ROWTYPE;
  v_payload jsonb;
  v_initiatives jsonb;
  v_allowed_ids uuid[];
  v_completed jsonb;
  v_allocations jsonb;
  v_baselines jsonb;
BEGIN
  SELECT e.unit, e.label
  INTO v_unit, v_label
  FROM public.public_embed_links e
  WHERE e.slug = btrim(p_slug)
    AND e.enabled = true;

  IF v_unit IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_dataset
  FROM public.portfolio_datasets
  WHERE is_active
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_dataset.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_payload := CASE
    WHEN v_dataset.kind = 'live' THEN public.build_portfolio_dataset_payload()
    ELSE v_dataset.payload
  END;

  SELECT
    COALESCE(jsonb_agg(item ORDER BY item->>'team', item->>'initiative'), '[]'::jsonb),
    COALESCE(array_agg((item->>'id')::uuid), ARRAY[]::uuid[])
  INTO v_initiatives, v_allowed_ids
  FROM jsonb_array_elements(COALESCE(v_payload->'initiatives', '[]'::jsonb)) AS item
  WHERE COALESCE(item->>'deleted_at', '') = ''
    AND item->>'unit' = v_unit
    AND NOT public.is_sensitive_unit_team(item->>'unit', item->>'team');

  SELECT COALESCE(
    jsonb_agg((item->>'initiative_id')::uuid ORDER BY item->>'initiative_id'),
    '[]'::jsonb
  )
  INTO v_completed
  FROM jsonb_array_elements(COALESCE(v_payload->'initiative_portfolio_meta', '[]'::jsonb)) AS item
  WHERE COALESCE((item->>'is_portfolio_completed')::boolean, false)
    AND (item->>'initiative_id')::uuid = ANY(v_allowed_ids);

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'initiative_id', item->>'budget_department'), '[]'::jsonb)
  INTO v_allocations
  FROM jsonb_array_elements(COALESCE(v_payload->'budget_department_allocations', '[]'::jsonb)) AS item
  WHERE (item->>'initiative_id')::uuid = ANY(v_allowed_ids);

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'team'), '[]'::jsonb)
  INTO v_baselines
  FROM jsonb_array_elements(COALESCE(v_payload->'team_baselines', '[]'::jsonb)) AS item
  WHERE item->>'unit' = v_unit;

  RETURN jsonb_build_object(
    'slug', btrim(p_slug),
    'unit', v_unit,
    'label', v_label,
    'dataset', jsonb_build_object(
      'id', v_dataset.id,
      'label', v_dataset.label,
      'kind', v_dataset.kind,
      'snapshot_at', v_dataset.snapshot_at
    ),
    'initiatives', v_initiatives,
    'portfolio_completed_ids', v_completed,
    'budget_department_allocations', v_allocations,
    'team_baselines', v_baselines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_embed_portfolio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_embed_portfolio(text) TO anon, authenticated;
