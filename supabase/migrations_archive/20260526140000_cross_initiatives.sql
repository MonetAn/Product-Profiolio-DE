-- Кросс-инициативы (ранний доступ): именованные группы инициатив с долями стоимости.

CREATE TABLE IF NOT EXISTS public.cross_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

COMMENT ON TABLE public.cross_initiatives IS
  'Кросс-инициатива: зонтик над несколькими инициативами без слияния записей. Ранний доступ.';

CREATE TABLE IF NOT EXISTS public.cross_initiative_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cross_initiative_id uuid NOT NULL REFERENCES public.cross_initiatives(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  cost_share_pct numeric(6, 2) NOT NULL DEFAULT 100
    CHECK (cost_share_pct > 0 AND cost_share_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_initiative_members_unique UNIQUE (cross_initiative_id, initiative_id)
);

COMMENT ON TABLE public.cross_initiative_members IS
  'Доля стоимости инициативы (0–100%), учитываемая в данной кросс-инициативе. Сумма долей по initiative_id = 100.';

CREATE INDEX IF NOT EXISTS idx_cross_initiative_members_cross
  ON public.cross_initiative_members (cross_initiative_id);
CREATE INDEX IF NOT EXISTS idx_cross_initiative_members_initiative
  ON public.cross_initiative_members (initiative_id);

CREATE OR REPLACE FUNCTION public.user_can_see_cross_initiative(p_cross_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cross_initiative_members m
    WHERE m.cross_initiative_id = p_cross_id
      AND public.user_can_see_initiative_id(m.initiative_id)
  );
$$;

ALTER TABLE public.cross_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_initiative_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Early access cross initiatives" ON public.cross_initiatives;
DROP POLICY IF EXISTS "Early access cross initiatives select" ON public.cross_initiatives;

CREATE POLICY "Early access cross initiatives select"
  ON public.cross_initiatives
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND (
      public.user_can_see_cross_initiative(id)
      OR NOT EXISTS (
        SELECT 1
        FROM public.cross_initiative_members m
        WHERE m.cross_initiative_id = cross_initiatives.id
      )
    )
  );

DROP POLICY IF EXISTS "Early access cross initiative members select" ON public.cross_initiative_members;
CREATE POLICY "Early access cross initiative members select"
  ON public.cross_initiative_members
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND (
      public.user_can_see_initiative_id(initiative_id)
      OR public.user_can_see_cross_initiative(cross_initiative_id)
    )
  );

DROP POLICY IF EXISTS "Early access cross initiative members write" ON public.cross_initiative_members;
DROP POLICY IF EXISTS "Early access cross initiative members insert" ON public.cross_initiative_members;
DROP POLICY IF EXISTS "Early access cross initiative members update" ON public.cross_initiative_members;
DROP POLICY IF EXISTS "Early access cross initiative members delete" ON public.cross_initiative_members;

CREATE POLICY "Early access cross initiative members insert"
  ON public.cross_initiative_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(initiative_id)
  );

CREATE POLICY "Early access cross initiative members update"
  ON public.cross_initiative_members
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(initiative_id)
  )
  WITH CHECK (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(initiative_id)
  );

CREATE POLICY "Early access cross initiative members delete"
  ON public.cross_initiative_members
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(initiative_id)
  );

-- INSERT cross_initiatives: пока нет участников — разрешить создателю с early_access
DROP POLICY IF EXISTS "Early access cross initiatives insert" ON public.cross_initiatives;
CREATE POLICY "Early access cross initiatives insert"
  ON public.cross_initiatives
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_early_access());

DROP POLICY IF EXISTS "Early access cross initiatives update" ON public.cross_initiatives;
CREATE POLICY "Early access cross initiatives update"
  ON public.cross_initiatives
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND public.user_can_see_cross_initiative(id)
  )
  WITH CHECK (
    public.current_user_has_early_access()
    AND public.user_can_see_cross_initiative(id)
  );

DROP POLICY IF EXISTS "Early access cross initiatives delete" ON public.cross_initiatives;
CREATE POLICY "Early access cross initiatives delete"
  ON public.cross_initiatives
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND (
      public.user_can_see_cross_initiative(id)
      OR NOT EXISTS (
        SELECT 1
        FROM public.cross_initiative_members m
        WHERE m.cross_initiative_id = cross_initiatives.id
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_initiatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_initiative_members TO authenticated;

-- Снимок для UI: кросс-инициативы, где видна хотя бы одна инициатива; все участники с именами.
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

COMMENT ON FUNCTION public.get_cross_initiatives_bundle IS
  'Ранний доступ: кросс-инициативы и участники (имена всех в группе, если видна хотя бы одна).';

GRANT EXECUTE ON FUNCTION public.get_cross_initiatives_bundle() TO authenticated;
