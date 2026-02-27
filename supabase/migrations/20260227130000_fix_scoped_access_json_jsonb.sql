-- Fix: user_can_see_unit_team used json with jsonb operators (@>, jsonb_array_elements).
-- Cast scope->'allowed_units' and scope->'allowed_team_pairs' to jsonb to fix "operator does not exist: json @> jsonb".

CREATE OR REPLACE FUNCTION public.user_can_see_unit_team(p_unit text, p_team text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  scope json;
  elem jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RETURN false;
  END IF;
  scope := public.get_my_scope();
  IF (scope->>'see_all')::boolean = true THEN
    RETURN true;
  END IF;
  IF p_unit IS NULL AND p_team IS NULL THEN
    RETURN false;
  END IF;
  IF p_unit IS NOT NULL AND (scope->'allowed_units')::jsonb @> to_jsonb(p_unit) THEN
    RETURN true;
  END IF;
  IF p_unit IS NOT NULL AND p_team IS NOT NULL THEN
    FOR elem IN SELECT * FROM jsonb_array_elements((scope->'allowed_team_pairs')::jsonb)
    LOOP
      IF (elem->>'unit') IS NOT DISTINCT FROM p_unit AND (elem->>'team') IS NOT DISTINCT FROM p_team THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;
