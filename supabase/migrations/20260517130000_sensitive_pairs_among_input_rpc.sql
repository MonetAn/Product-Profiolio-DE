-- Пары (unit, team) из входа, для которых public.is_sensitive_unit_team = true.
-- Совпадает с логикой RLS; только admin/super_admin — иначе пустой результат (без утечки).

CREATE OR REPLACE FUNCTION public.sensitive_pairs_among_input(p_pairs jsonb)
RETURNS TABLE (unit text, team text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (x->>'unit')::text AS unit,
    CASE
      WHEN NOT (x ? 'team') OR jsonb_typeof(x->'team') = 'null' THEN NULL::text
      ELSE (x->>'team')::text
    END AS team
  FROM jsonb_array_elements(COALESCE(p_pairs, '[]'::jsonb)) AS t(x)
  WHERE public.current_user_is_admin()
    AND public.is_sensitive_unit_team(
      (x->>'unit')::text,
      CASE
        WHEN NOT (x ? 'team') OR jsonb_typeof(x->'team') = 'null' THEN NULL::text
        ELSE (x->>'team')::text
      END
    );
$$;

REVOKE ALL ON FUNCTION public.sensitive_pairs_among_input(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sensitive_pairs_among_input(jsonb) TO authenticated;
