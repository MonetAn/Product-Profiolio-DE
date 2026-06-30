-- Публичные embed-ссылки на дашборд (без Google-авторизации): только заранее настроенные юниты.

CREATE TABLE IF NOT EXISTS public.public_embed_links (
  slug text PRIMARY KEY,
  unit text NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_embed_links IS
  'Slug → юнит для публичного embed-дашборда (/embed/:slug). Данные отдаются через get_public_embed_portfolio, без sensitive.';

ALTER TABLE public.public_embed_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage public_embed_links" ON public.public_embed_links;
CREATE POLICY "Super admins manage public_embed_links"
  ON public.public_embed_links FOR ALL TO authenticated
  USING (public.current_user_is_super_admin())
  WITH CHECK (public.current_user_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_embed_links TO authenticated;

INSERT INTO public.public_embed_links (slug, unit, label)
VALUES
  ('tech-platform', 'Tech Platform', 'Tech Platform'),
  ('b2b-pizza', 'B2B Pizza', 'B2B Pizza')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_embed_portfolio(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit text;
  v_label text;
  v_initiatives jsonb;
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

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'unit', i.unit,
        'team', i.team,
        'initiative', i.initiative,
        'stakeholders_list', i.stakeholders_list,
        'description', i.description,
        'documentation_link', i.documentation_link,
        'stakeholders', i.stakeholders,
        'is_timeline_stub', i.is_timeline_stub,
        'quarterly_data', i.quarterly_data,
        'geo_cost_split', i.geo_cost_split
      )
      ORDER BY i.unit, i.team, i.initiative
    ),
    '[]'::jsonb
  )
  INTO v_initiatives
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
    AND i.unit = v_unit
    AND NOT public.is_sensitive_unit_team(i.unit, i.team);

  SELECT COALESCE(
    jsonb_agg(m.initiative_id ORDER BY m.initiative_id),
    '[]'::jsonb
  )
  INTO v_completed
  FROM public.initiative_portfolio_meta m
  JOIN public.initiatives i ON i.id = m.initiative_id
  WHERE m.is_portfolio_completed = true
    AND i.deleted_at IS NULL
    AND i.unit = v_unit
    AND NOT public.is_sensitive_unit_team(i.unit, i.team);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'initiative_id', a.initiative_id,
        'budget_department', a.budget_department,
        'is_in_pnl_it', a.is_in_pnl_it,
        'q1', a.q1,
        'q2', a.q2,
        'q3', a.q3,
        'q4', a.q4
      )
      ORDER BY a.initiative_id, a.budget_department
    ),
    '[]'::jsonb
  )
  INTO v_allocations
  FROM public.initiative_budget_department_2026 a
  JOIN public.initiatives i ON i.id = a.initiative_id
  WHERE i.deleted_at IS NULL
    AND i.unit = v_unit
    AND NOT public.is_sensitive_unit_team(i.unit, i.team);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'unit', b.unit,
        'team', b.team,
        'q1', b.q1,
        'q2', b.q2,
        'q3', b.q3,
        'q4', b.q4,
        'rub_all', b.rub_all,
        'rub_pnl_it', b.rub_pnl_it
      )
      ORDER BY b.team
    ),
    '[]'::jsonb
  )
  INTO v_baselines
  FROM public.team_budget_baseline_2026 b
  WHERE b.unit = v_unit;

  RETURN jsonb_build_object(
    'slug', btrim(p_slug),
    'unit', v_unit,
    'label', v_label,
    'initiatives', v_initiatives,
    'portfolio_completed_ids', v_completed,
    'budget_department_allocations', v_allocations,
    'team_baselines', v_baselines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_embed_portfolio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_embed_portfolio(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_embed_portfolio(text) IS
  'Публичные данные embed-дашборда по slug. Без auth; только enabled slug; без sensitive_scopes.';
