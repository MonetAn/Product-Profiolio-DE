-- Supabase SQL Editor (прод): глобальный тоггл «Динамический вью (все)».

CREATE TABLE IF NOT EXISTS public.dashboard_treemap_layout_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dynamic_for_all boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.dashboard_treemap_layout_config (id, dynamic_for_all)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dashboard_treemap_layout_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read treemap layout config"
  ON public.dashboard_treemap_layout_config;

CREATE POLICY "Authenticated read treemap layout config"
  ON public.dashboard_treemap_layout_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin update treemap layout config"
  ON public.dashboard_treemap_layout_config;

CREATE POLICY "Super admin update treemap layout config"
  ON public.dashboard_treemap_layout_config
  FOR UPDATE TO authenticated
  USING (public.current_user_is_super_admin())
  WITH CHECK (public.current_user_is_super_admin());

GRANT SELECT, UPDATE ON public.dashboard_treemap_layout_config TO authenticated;
