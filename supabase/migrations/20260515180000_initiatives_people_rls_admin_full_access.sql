-- Широкий доступ для admin/super_admin к initiatives и people: без ограничений
-- sensitive_scopes и soft-delete на чтение/запись для этих ролей.
-- Обычные пользователи (role user): прежняя логика — user_can_see_row_with_sensitive,
-- скрытие soft-deleted от не-super в SELECT.
--
-- Не отключает RLS целиком и не трогает другие таблицы (assignments, snapshots и т.д.).

-- ---------- initiatives ----------
DROP POLICY IF EXISTS "initiatives_authenticated_select" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_insert" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_update" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_delete" ON public.initiatives;
DROP POLICY IF EXISTS "hide_soft_deleted_select_initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "hide_soft_deleted_update_initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;

CREATE POLICY "initiatives_authenticated_all" ON public.initiatives
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND (
      public.current_user_is_admin()
      OR (
        public.user_can_see_row_with_sensitive(unit, team)
        AND (deleted_at IS NULL OR public.current_user_is_super_admin())
      )
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND (
      public.current_user_is_admin()
      OR public.user_can_see_row_with_sensitive(unit, team)
    )
  );

-- ---------- people ----------
DROP POLICY IF EXISTS "people_authenticated_select" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_insert" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_update" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_delete" ON public.people;
DROP POLICY IF EXISTS "hide_soft_deleted_select_people" ON public.people;
DROP POLICY IF EXISTS "hide_soft_deleted_update_people" ON public.people;
DROP POLICY IF EXISTS "Allowed users only" ON public.people;

CREATE POLICY "people_authenticated_all" ON public.people
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND (
      public.current_user_is_admin()
      OR (
        public.user_can_see_row_with_sensitive(unit, team)
        AND (deleted_at IS NULL OR public.current_user_is_super_admin())
      )
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND (
      public.current_user_is_admin()
      OR public.user_can_see_row_with_sensitive(unit, team)
    )
  );
