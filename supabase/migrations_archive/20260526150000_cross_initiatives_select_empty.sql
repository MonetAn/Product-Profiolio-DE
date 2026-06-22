-- Фикс: после INSERT кросс-инициативы .select('id') падал, пока нет участников (RLS SELECT).

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
