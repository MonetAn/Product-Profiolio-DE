-- RPCs for activity summary (stats + chart by day) and sessions aggregation.
-- Admin-only. Run after 20260302120000_activity_events.sql.

-- get_activity_summary: returns { total_events, unique_users, by_day: [ { date, count } ] }
CREATE OR REPLACE FUNCTION public.get_activity_summary(
  period_start timestamptz,
  period_end timestamptz,
  filter_user_email text DEFAULT NULL,
  filter_type text DEFAULT NULL,
  filter_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
  total_events bigint;
  unique_users bigint;
  by_day json;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get activity summary';
  END IF;

  SELECT count(*), count(DISTINCT user_id)
  INTO total_events, unique_users
  FROM public.activity_events e
  WHERE e.created_at >= period_start
    AND e.created_at <= period_end
    AND (filter_user_email IS NULL OR e.user_email ILIKE '%' || filter_user_email || '%')
    AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
    AND (filter_path IS NULL OR filter_path = '' OR e.path ILIKE '%' || filter_path || '%');

  SELECT json_agg(
    json_build_object('date', d::text, 'count', c)
    ORDER BY d
  )
  INTO by_day
  FROM (
    SELECT date_trunc('day', e.created_at)::date AS d, count(*)::int AS c
    FROM public.activity_events e
    WHERE e.created_at >= period_start
      AND e.created_at <= period_end
      AND (filter_user_email IS NULL OR e.user_email ILIKE '%' || filter_user_email || '%')
      AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
      AND (filter_path IS NULL OR filter_path = '' OR e.path ILIKE '%' || filter_path || '%')
    GROUP BY date_trunc('day', e.created_at)::date
  ) sub;

  result := json_build_object(
    'total_events', COALESCE(total_events, 0),
    'unique_users', COALESCE(unique_users, 0),
    'by_day', COALESCE(by_day, '[]'::json)
  );
  RETURN result;
END;
$$;

-- get_activity_sessions: returns one row per session (session_id, user_email, first_at, last_at, event_count)
CREATE OR REPLACE FUNCTION public.get_activity_sessions(
  period_start timestamptz,
  period_end timestamptz,
  filter_user_email text DEFAULT NULL,
  filter_type text DEFAULT NULL
)
RETURNS TABLE (
  session_id text,
  user_email text,
  first_at timestamptz,
  last_at timestamptz,
  event_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get activity sessions';
  END IF;

  RETURN QUERY
  SELECT
    e.session_id,
    max(e.user_email)::text AS user_email,
    min(e.created_at) AS first_at,
    max(e.created_at) AS last_at,
    count(*)::bigint AS event_count
  FROM public.activity_events e
  WHERE e.created_at >= period_start
    AND e.created_at <= period_end
    AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
    AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
  GROUP BY e.session_id
  ORDER BY max(e.created_at) DESC;
END;
$$;

COMMENT ON FUNCTION public.get_activity_summary IS 'Admin only. Returns total_events, unique_users, by_day array for filters and date range.';
COMMENT ON FUNCTION public.get_activity_sessions IS 'Admin only. Returns one row per session with first/last activity and event count.';
