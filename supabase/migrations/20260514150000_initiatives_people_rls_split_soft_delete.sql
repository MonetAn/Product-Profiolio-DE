-- PostgREST после PATCH проверяет новую строку на SELECT.
-- RESTRICTIVE hide_soft_deleted_select_* требует deleted_at IS NULL → после soft delete
-- новая строка не проходит SELECT → 42501 «violates … hide_soft_deleted_select…».
--
-- Убираем пару RESTRICTIVE + FOR ALL «Allowed users only» на initiatives/people:
-- отдельные PERMISSIVE политики по команде.
-- UPDATE WITH CHECK без OLD/NEW: на PG < 15 OLD в политиках недоступен (42P01).
-- USING уже ограничивает старую строку (только активная или super) — этого достаточно
-- для soft delete; WITH CHECK оставляем только доступ по scope/sensitive на новую строку.

-- ---------- initiatives ----------
DROP POLICY IF EXISTS "initiatives_authenticated_select" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_insert" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_update" ON public.initiatives;
DROP POLICY IF EXISTS "initiatives_authenticated_delete" ON public.initiatives;
DROP POLICY IF EXISTS "hide_soft_deleted_select_initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "hide_soft_deleted_update_initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "Allowed users only" ON public.initiatives;

CREATE POLICY "initiatives_authenticated_select" ON public.initiatives
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  );

CREATE POLICY "initiatives_authenticated_insert" ON public.initiatives
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

CREATE POLICY "initiatives_authenticated_update" ON public.initiatives
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

CREATE POLICY "initiatives_authenticated_delete" ON public.initiatives
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  );

-- ---------- people ----------
DROP POLICY IF EXISTS "people_authenticated_select" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_insert" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_update" ON public.people;
DROP POLICY IF EXISTS "people_authenticated_delete" ON public.people;
DROP POLICY IF EXISTS "hide_soft_deleted_select_people" ON public.people;
DROP POLICY IF EXISTS "hide_soft_deleted_update_people" ON public.people;
DROP POLICY IF EXISTS "Allowed users only" ON public.people;

CREATE POLICY "people_authenticated_select" ON public.people
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  );

CREATE POLICY "people_authenticated_insert" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

CREATE POLICY "people_authenticated_update" ON public.people
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

CREATE POLICY "people_authenticated_delete" ON public.people
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
    AND (deleted_at IS NULL OR public.current_user_is_super_admin())
  );
