-- Replace verbose activity_events with at-most-one row per (user, surface, UTC day).
-- Surfaces: portfolio (main dashboard), admin (any /admin* after admin check).

-- Drop legacy activity RPCs (signatures must match deployed versions).
DROP FUNCTION IF EXISTS public.get_activity_sessions(timestamptz, timestamptz, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_activity_sessions(timestamptz, timestamptz, text, text, text[], text[]);
DROP FUNCTION IF EXISTS public.get_activity_summary(timestamptz, timestamptz, text, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_activity_summary(timestamptz, timestamptz, text, text, text, text[], text[]);
DROP FUNCTION IF EXISTS public.get_activity_events_stats();
DROP FUNCTION IF EXISTS public.prune_activity_events_by_range(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.prune_activity_events();

DROP TABLE IF EXISTS public.activity_events;

CREATE TABLE public.user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_email text,
  surface text NOT NULL CHECK (surface IN ('portfolio', 'admin')),
  day date NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_presence_user_surface_day UNIQUE (user_id, surface, day)
);

CREATE INDEX IF NOT EXISTS idx_user_presence_day ON public.user_presence (day);
CREATE INDEX IF NOT EXISTS idx_user_presence_user_id ON public.user_presence (user_id);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_presence IS 'At most one row per user per surface per UTC calendar day. Written only via record_presence().';

REVOKE ALL ON public.user_presence FROM PUBLIC;
GRANT SELECT ON public.user_presence TO postgres;

-- Authenticated user records own presence (deduped by UNIQUE + ON CONFLICT).
CREATE OR REPLACE FUNCTION public.record_presence(p_surface text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_day date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_surface IS NULL OR p_surface NOT IN ('portfolio', 'admin') THEN
    RAISE EXCEPTION 'Invalid surface';
  END IF;

  SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = v_uid;
  v_day := (timezone('utc', now()))::date;

  INSERT INTO public.user_presence (user_id, user_email, surface, day, first_seen_at)
  VALUES (v_uid, v_email, p_surface, v_day, now())
  ON CONFLICT (user_id, surface, day) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.record_presence IS 'Idempotent daily presence for portfolio or admin (UTC day).';

GRANT EXECUTE ON FUNCTION public.record_presence(text) TO authenticated;

-- Admin timeline: per user per day which surfaces were seen.
CREATE OR REPLACE FUNCTION public.get_presence_timeline(
  period_start date,
  period_end date,
  filter_user_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get presence timeline';
  END IF;

  IF period_start IS NULL OR period_end IS NULL OR period_end < period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  WITH agg AS (
    SELECT
      COALESCE(p.user_email, '') AS user_email,
      p.day,
      bool_or(p.surface = 'portfolio') AS portfolio,
      bool_or(p.surface = 'admin') AS admin,
      min(p.first_seen_at) AS first_seen_at
    FROM public.user_presence p
    WHERE p.day >= period_start
      AND p.day <= period_end
      AND (
        filter_user_email IS NULL
        OR filter_user_email = ''
        OR LOWER(p.user_email) = LOWER(filter_user_email)
      )
    GROUP BY p.user_email, p.day
  ),
  users AS (
    SELECT coalesce(
      (SELECT json_agg(sub.u ORDER BY sub.u) FROM (
        SELECT DISTINCT agg.user_email AS u FROM agg WHERE agg.user_email <> ''
      ) sub),
      '[]'::json
    ) AS j
  ),
  items AS (
    SELECT coalesce(
      (SELECT json_agg(
        json_build_object(
          'user_email', a.user_email,
          'day', a.day::text,
          'portfolio', a.portfolio,
          'admin', a.admin,
          'first_seen_at', a.first_seen_at
        )
        ORDER BY a.day DESC, a.user_email
      ) FROM agg a),
      '[]'::json
    ) AS j
  )
  SELECT json_build_object(
    'users', (SELECT j FROM users),
    'items', (SELECT j FROM items)
  )
  INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_presence_timeline IS 'Admin only. UTC dates. Optional exact user_email filter.';

GRANT EXECUTE ON FUNCTION public.get_presence_timeline(date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_presence_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  row_count bigint;
  table_size_bytes bigint;
  table_size_pretty text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get user presence stats';
  END IF;

  SELECT count(*) INTO row_count FROM public.user_presence;
  SELECT pg_total_relation_size('public.user_presence') INTO table_size_bytes;
  table_size_pretty := pg_size_pretty(table_size_bytes);

  RETURN json_build_object(
    'row_count', row_count,
    'table_size_bytes', table_size_bytes,
    'table_size_pretty', table_size_pretty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_presence_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.prune_user_presence_by_range(
  period_start date,
  period_end date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can prune user presence';
  END IF;

  WITH deleted AS (
    DELETE FROM public.user_presence
    WHERE day >= period_start AND day <= period_end
    RETURNING id
  )
  SELECT count(*)::integer INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_user_presence_by_range(date, date) TO authenticated;
