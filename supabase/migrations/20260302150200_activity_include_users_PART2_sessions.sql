-- PART 2 of 2: run this after PART1 succeeded.
-- Adds include_user_emails to get_activity_sessions.

DROP FUNCTION IF EXISTS public.get_activity_sessions(timestamptz, timestamptz, text, text, text[]);

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
      (
        (array_length(include_arr, 1) IS NULL OR array_length(include_arr, 1) = 0)
        AND (filter_user_email IS NULL OR filter_user_email = '' OR e.user_email ILIKE '%' || filter_user_email || '%')
        AND (array_length(exclude_arr, 1) IS NULL OR e.user_email IS NULL OR NOT (e.user_email = ANY(exclude_arr)))
      )
    )
  GROUP BY e.session_id
  ORDER BY max(e.created_at) DESC;
END;
$sess$;

COMMENT ON FUNCTION public.get_activity_summary(timestamptz, timestamptz, text, text, text, text[], text[]) IS 'Admin only. include_user_emails: show only these users; else filter_user_email + exclude_user_emails.';
COMMENT ON FUNCTION public.get_activity_sessions(timestamptz, timestamptz, text, text, text[], text[]) IS 'Admin only. include_user_emails: show only these users; else filter_user_email + exclude_user_emails.';
