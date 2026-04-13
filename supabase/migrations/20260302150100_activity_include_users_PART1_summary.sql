-- PART 1 of 2: run this first in SQL Editor.
-- Adds include_user_emails to get_activity_summary.

DROP FUNCTION IF EXISTS public.get_activity_summary(timestamptz, timestamptz, text, text, text, text[]);

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

  SELECT json_agg(x.row ORDER BY sub.d)
  INTO by_day
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
  ) sub,
  LATERAL (SELECT json_build_object('date', sub.d::text, 'count', sub.c) AS row) x;

  SELECT json_agg(x.row ORDER BY sub2.c DESC)
  INTO by_user
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
  ) sub2,
  LATERAL (SELECT json_build_object('user_email', sub2.u, 'count', sub2.c) AS row) x;

  result := json_build_object(
    'total_events', COALESCE(total_events, 0),
    'unique_users', COALESCE(unique_users, 0),
    'by_day', COALESCE(by_day, '[]'::json),
    'by_user', COALESCE(by_user, '[]'::json)
  );
  RETURN result;
END;
$fn$;
