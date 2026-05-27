-- HOTFIX для прода: вставить целиком в Supabase → SQL Editor → Run.
-- Идемпотентно. Соответствует migration 20260526160000_cross_initiatives_rls_fix.sql
--
-- После Run: в приложении Ctrl+Shift+R, sessionStorage.removeItem('app_access'), перелогин.
-- Проверка: scripts/sql/diagnose_cross_initiatives_rls.sql

-- Снять все известные политики на cross_initiatives (в т.ч. старую FOR ALL)
DROP POLICY IF EXISTS "Early access cross initiatives" ON public.cross_initiatives;
DROP POLICY IF EXISTS "Early access cross initiatives select" ON public.cross_initiatives;
DROP POLICY IF EXISTS "Early access cross initiatives insert" ON public.cross_initiatives;
DROP POLICY IF EXISTS "Early access cross initiatives update" ON public.cross_initiatives;
DROP POLICY IF EXISTS "Early access cross initiatives delete" ON public.cross_initiatives;

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

CREATE POLICY "Early access cross initiatives insert"
  ON public.cross_initiatives
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_early_access());

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

CREATE OR REPLACE FUNCTION public.create_cross_initiative_with_members(
  p_name text,
  p_initiative_ids uuid[],
  p_created_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cross_id uuid;
  v_init_id uuid;
  v_member_id uuid;
  v_n int;
  v_share numeric(6, 2);
  v_i int;
BEGIN
  IF NOT public.current_user_has_early_access() THEN
    RAISE EXCEPTION 'early_access_required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'cross_initiative_name_required';
  END IF;

  IF p_initiative_ids IS NULL OR array_length(p_initiative_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'initiative_ids_required';
  END IF;

  FOREACH v_init_id IN ARRAY p_initiative_ids LOOP
    IF NOT public.user_can_see_initiative_id(v_init_id) THEN
      RAISE EXCEPTION 'initiative_not_visible: %', v_init_id;
    END IF;
  END LOOP;

  INSERT INTO public.cross_initiatives (name, created_by)
  VALUES (trim(p_name), NULLIF(trim(p_created_by), ''))
  RETURNING id INTO v_cross_id;

  FOREACH v_init_id IN ARRAY p_initiative_ids LOOP
    INSERT INTO public.cross_initiative_members (cross_initiative_id, initiative_id, cost_share_pct)
    VALUES (v_cross_id, v_init_id, 100)
    ON CONFLICT (cross_initiative_id, initiative_id) DO NOTHING;

    SELECT count(*)::int INTO v_n
    FROM public.cross_initiative_members m
    WHERE m.initiative_id = v_init_id;

    IF v_n > 0 THEN
      v_share := round((100.0 / v_n)::numeric, 2);
      v_i := 0;
      FOR v_member_id IN
        SELECT m.id
        FROM public.cross_initiative_members m
        WHERE m.initiative_id = v_init_id
        ORDER BY m.created_at, m.id
      LOOP
        v_i := v_i + 1;
        UPDATE public.cross_initiative_members
        SET cost_share_pct = CASE
          WHEN v_i = v_n THEN round(100 - v_share * (v_n - 1), 2)
          ELSE v_share
        END
        WHERE id = v_member_id;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_cross_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cross_initiative_with_members(text, uuid[], text) TO authenticated;
