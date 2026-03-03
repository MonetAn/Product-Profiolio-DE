-- Activity tracking: table, RLS, prune old events (retention 1 month).
-- Run after scoped_access migrations (needs allowed_users.role).

-- Helper: true if current user is admin (allowed_users.role = 'admin').
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
    AND a.role = 'admin'
  );
$$;

-- Table: one row per event (page_view, heartbeat, click, etc.).
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  session_id text NOT NULL,
  event_type text NOT NULL,
  path text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON public.activity_events (created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON public.activity_events (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON public.activity_events (event_type);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert only their own events (user_id = auth.uid()).
CREATE POLICY "Users insert own activity"
  ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins may read all activity.
CREATE POLICY "Admins read all activity"
  ON public.activity_events FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

-- No update/delete via RLS for normal users. Prune is done via SECURITY DEFINER function.
CREATE POLICY "No direct delete"
  ON public.activity_events FOR DELETE TO authenticated
  USING (false);

-- Prune events older than 1 month. Callable by admins only (or from pg_cron with definer).
CREATE OR REPLACE FUNCTION public.prune_activity_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can prune activity events';
  END IF;
  WITH deleted AS (
    DELETE FROM public.activity_events
    WHERE created_at < now() - interval '1 month'
    RETURNING id
  )
  SELECT count(*)::integer INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE public.activity_events IS 'User activity for dashboard: page views, heartbeats, clicks. Retention: 1 month.';
COMMENT ON FUNCTION public.prune_activity_events IS 'Deletes activity_events older than 1 month. Admin only. Can be called from UI or scheduled with pg_cron.';

-- Optional: enable pg_cron in Dashboard → Integrations, then run:
-- SELECT cron.schedule('prune-activity-events', '0 4 * * *', $$ SELECT public.prune_activity_events() $$);
