-- Replace fixed "older than 1 month" prune with date-range prune; add stats for UI.
-- Run after activity_events and related RPCs exist.

DROP FUNCTION IF EXISTS public.prune_activity_events();

-- Delete events in the given date range. Admin only. Returns deleted count.
CREATE OR REPLACE FUNCTION public.prune_activity_events_by_range(
  period_start timestamptz,
  period_end timestamptz
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
    RAISE EXCEPTION 'Only admins can prune activity events';
  END IF;
  WITH deleted AS (
    DELETE FROM public.activity_events
    WHERE created_at >= period_start AND created_at <= period_end
    RETURNING id
  )
  SELECT count(*)::integer INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.prune_activity_events_by_range IS 'Deletes activity_events in the given date range. Admin only.';

-- Return row count and table size for activity_events. Admin only.
CREATE OR REPLACE FUNCTION public.get_activity_events_stats()
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
    RAISE EXCEPTION 'Only admins can get activity events stats';
  END IF;

  SELECT count(*) INTO row_count FROM public.activity_events;
  SELECT pg_total_relation_size('public.activity_events') INTO table_size_bytes;
  table_size_pretty := pg_size_pretty(table_size_bytes);

  RETURN json_build_object(
    'row_count', row_count,
    'table_size_bytes', table_size_bytes,
    'table_size_pretty', table_size_pretty
  );
END;
$$;

COMMENT ON FUNCTION public.get_activity_events_stats IS 'Admin only. Returns row_count, table_size_bytes, table_size_pretty for activity_events.';
