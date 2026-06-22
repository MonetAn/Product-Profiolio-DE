-- Локации: обратная связь по инициатива × кластер и предложение продуктов (bottom-up hint).

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS proposed_geo_cost_split jsonb NULL;

COMMENT ON COLUMN public.initiatives.proposed_geo_cost_split IS
  'Предложение продуктов по geo split (read-only hint для C-Level; не источник истины).';

CREATE TABLE IF NOT EXISTS public.initiative_geo_market_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  cluster_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'question', 'reject')),
  comment text NOT NULL DEFAULT '',
  author_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_geo_feedback_initiative_cluster
  ON public.initiative_geo_market_feedback_events (initiative_id, cluster_key, created_at DESC);

ALTER TABLE public.initiative_geo_market_feedback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users read geo feedback" ON public.initiative_geo_market_feedback_events;
CREATE POLICY "Allowed users read geo feedback"
  ON public.initiative_geo_market_feedback_events
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());

DROP POLICY IF EXISTS "Allowed users insert geo feedback" ON public.initiative_geo_market_feedback_events;
CREATE POLICY "Allowed users insert geo feedback"
  ON public.initiative_geo_market_feedback_events
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_access());

GRANT SELECT, INSERT ON public.initiative_geo_market_feedback_events TO authenticated;

COMMENT ON TABLE public.initiative_geo_market_feedback_events IS
  'История статусов/комментариев по оплате инициативы кластером (append-only).';
