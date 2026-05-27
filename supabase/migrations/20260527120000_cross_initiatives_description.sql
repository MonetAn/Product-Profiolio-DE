-- Описание кросс-инициативы для боковой панели обзора.

ALTER TABLE public.cross_initiatives
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.cross_initiatives.description IS
  'Описание кросс-инициативы (markdown).';

CREATE OR REPLACE FUNCTION public.get_cross_initiatives_bundle()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF NOT public.current_user_has_early_access() THEN
    RETURN json_build_object('cross_initiatives', '[]'::json, 'members', '[]'::json);
  END IF;

  SELECT json_build_object(
    'cross_initiatives',
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'created_at', c.created_at,
            'updated_at', c.updated_at
          )
          ORDER BY c.name
        )
        FROM public.cross_initiatives c
        WHERE public.user_can_see_cross_initiative(c.id)
      ),
      '[]'::json
    ),
    'members',
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', m.id,
            'cross_initiative_id', m.cross_initiative_id,
            'initiative_id', m.initiative_id,
            'cost_share_pct', m.cost_share_pct,
            'initiative_name', i.initiative,
            'unit', i.unit,
            'team', i.team,
            'can_view_details', public.user_can_see_initiative_id(i.id)
          )
          ORDER BY m.cross_initiative_id, i.initiative
        )
        FROM public.cross_initiative_members m
        JOIN public.initiatives i ON i.id = m.initiative_id
        WHERE public.user_can_see_cross_initiative(m.cross_initiative_id)
          AND (i.deleted_at IS NULL OR public.is_super_admin())
      ),
      '[]'::json
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
