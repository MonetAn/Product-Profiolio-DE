-- Add include_user_emails to activity RPCs (show only selected users).
-- When include_user_emails is non-empty, filter to those emails only; otherwise use filter_user_email + exclude_user_emails.

DROP FUNCTION IF EXISTS public.get_activity_summary(timestamptz, timestamptz, text, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_activity_sessions(timestamptz, timestamptz, text, text, text[]);

CREATE OR REPLACE FUNCTION public.get_activity_summary(
  period_start timestamptz,
  period_end timestamptz,
  filter_user_email text DEFAULT NULL,
  filter_type text DEFAULT NULL,
  filter_path text DEFAULT NULL,
  exclude_user_emails text[] DEFAULT NULL,
  include_user_emails text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
DECLARE
  result json;
  total_events bigint;
  unique_users bigint;
  by_day json;
  by_user json;
  exclude_arr text[];
  include_arr text[];
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get activity summary';
  END IF;

  exclude_arr := COALESCE(exclude_user_emails, ARRAY[]::text[]);
  include_arr := COALESCE(include_user_emails, ARRAY[]::text[]);

  SELECT count(*), count(DISTINCT user_id)
  FROM public.activity_events e
  WHERE e.created_at >= period_start
    AND e.created_at <= period_end
    AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
    AND (filter_path IS NULL OR filter_path = '' OR e.path ILIKE '%' || filter_path || '%')
    AND (
      (array_length(include_arr, 1) IS NOT NULL AND array_length(include_arr, 1) > 0 AND e.user_email = ANY(include_arr))
      OR
      (array_length(include_arr, 1) IS NULL OR array_length(include_arr, 1) = 0
        AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
        AND (array_length(exclude_arr, 1) IS NULL OR e.user_email IS NULL OR NOT (e.user_email = ANY(exclude_arr)))
    )
  INTO total_events, unique_users;

  by_day := (
    SELECT json_agg(
      json_build_object('date', d::text, 'count', c)
      ORDER BY d
    )
    FROM (
      SELECT date_trunc('day', e.created_at)::date AS d, count(*)::int AS c
      FROM public.activity_events e
      WHERE e.created_at >= period_start
        AND e.created_at <= period_end
        AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
        AND (filter_path IS NULL OR filter_path = '' OR e.path ILIKE '%' || filter_path || '%')
        AND (
          (array_length(include_arr, 1) IS NOT NULL AND array_length(include_arr, 1) > 0 AND e.user_email = ANY(include_arr))
          OR
          (array_length(include_arr, 1) IS NULL OR array_length(include_arr, 1) = 0
            AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
            AND (array_length(exclude_arr, 1) IS NULL OR e.user_email IS NULL OR NOT (e.user_email = ANY(exclude_arr)))
        )
      GROUP BY date_trunc('day', e.created_at)::date
    ) sub
  );

  by_user := (
    SELECT json_agg(
      json_build_object('user_email', u, 'count', c)
      ORDER BY c DESC
    )
    FROM (
      SELECT e.user_email::text AS u, count(*)::int AS c
      FROM public.activity_events e
      WHERE e.created_at >= period_start
        AND e.created_at <= period_end
        AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
        AND (filter_path IS NULL OR filter_path = '' OR e.path ILIKE '%' || filter_path || '%')
        AND (
          (array_length(include_arr, 1) IS NOT NULL AND array_length(include_arr, 1) > 0 AND e.user_email = ANY(include_arr))
          OR
          (array_length(include_arr, 1) IS NULL OR array_length(include_arr, 1) = 0
            AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
            AND (array_length(exclude_arr, 1) IS NULL OR e.user_email IS NULL OR NOT (e.user_email = ANY(exclude_arr)))
        )
      GROUP BY e.user_email
    ) sub2
  );

  result := json_build_object(
    'total_events', COALESCE(total_events, 0),
    'unique_users', COALESCE(unique_users, 0),
    'by_day', COALESCE(by_day, '[]'::json),
    'by_user', COALESCE(by_user, '[]'::json)
  );
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_activity_sessions(
  period_start timestamptz,
  period_end timestamptz,
  filter_user_email text DEFAULT NULL,
  filter_type text DEFAULT NULL,
  exclude_user_emails text[] DEFAULT NULL,
  include_user_emails text[] DEFAULT NULL
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
AS $sess$
DECLARE
  exclude_arr text[];
  include_arr text[];
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Only admins can get activity sessions';
  END IF;

  exclude_arr := COALESCE(exclude_user_emails, ARRAY[]::text[]);
  include_arr := COALESCE(include_user_emails, ARRAY[]::text[]);

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
    AND (filter_type IS NULL OR filter_type = '' OR e.event_type = filter_type)
    AND (
      (array_length(include_arr, 1) IS NOT NULL AND array_length(include_arr, 1) > 0 AND e.user_email = ANY(include_arr))
      OR
      (array_length(include_arr, 1) IS NULL OR array_length(include_arr, 1) = 0
        AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
        AND (array_length(exclude_arr, 1) IS NULL OR e.user_email IS NULL OR NOT (e.user_email = ANY(exclude_arr)))
    )
  GROUP BY e.session_id
  ORDER BY max(e.created_at) DESC;
END;
$sess$;

COMMENT ON FUNCTION public.get_activity_summary IS 'Admin only. include_user_emails: show only these users; else filter_user_email + exclude_user_emails.';
COMMENT ON FUNCTION public.get_activity_sessions IS 'Admin only. include_user_emails: show only these users; else filter_user_email + exclude_user_emails.';
