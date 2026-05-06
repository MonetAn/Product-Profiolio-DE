-- Soft delete для initiatives и people.
-- Идея: вместо физического DELETE проставляем deleted_at = now().
-- Скрытие реализовано через RESTRICTIVE RLS policy: применяется поверх
-- существующих политик через AND, дополняет их условием «deleted_at IS NULL
-- OR пользователь — super_admin».
--
-- В коде .delete() заменяется на .update({ deleted_at }).
-- Hard DELETE через UI остаётся технически возможным (RLS его не блокирует),
-- но фронт перестаёт его вызывать. При необходимости super_admin может
-- восстановить запись: UPDATE ... SET deleted_at = NULL.

-- 1. Колонки
ALTER TABLE public.initiatives ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.people      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.initiatives.deleted_at IS 'Soft delete: NULL = активна, иначе скрыта от не-super_admin.';
COMMENT ON COLUMN public.people.deleted_at      IS 'Soft delete: NULL = активна, иначе скрыта от не-super_admin.';

-- 2. Partial index для ускорения фильтрации по «активным»
CREATE INDEX IF NOT EXISTS idx_initiatives_active
  ON public.initiatives (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_people_active
  ON public.people (id)      WHERE deleted_at IS NULL;

-- 3. Helper function
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users
     WHERE email = auth.email() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.is_super_admin IS 'TRUE если текущий JWT-пользователь — super_admin в allowed_users.';

-- 4. RESTRICTIVE policies. Применяются ПОВЕРХ существующих через AND.
-- Цель: не дать обычному пользователю видеть/менять soft-deleted строки.

-- initiatives
DROP POLICY IF EXISTS "hide_soft_deleted_select_initiatives" ON public.initiatives;
CREATE POLICY "hide_soft_deleted_select_initiatives" ON public.initiatives
  AS RESTRICTIVE
  FOR SELECT
  USING (deleted_at IS NULL OR public.is_super_admin());

DROP POLICY IF EXISTS "hide_soft_deleted_update_initiatives" ON public.initiatives;
CREATE POLICY "hide_soft_deleted_update_initiatives" ON public.initiatives
  AS RESTRICTIVE
  FOR UPDATE
  USING (deleted_at IS NULL OR public.is_super_admin());

-- people
DROP POLICY IF EXISTS "hide_soft_deleted_select_people" ON public.people;
CREATE POLICY "hide_soft_deleted_select_people" ON public.people
  AS RESTRICTIVE
  FOR SELECT
  USING (deleted_at IS NULL OR public.is_super_admin());

DROP POLICY IF EXISTS "hide_soft_deleted_update_people" ON public.people;
CREATE POLICY "hide_soft_deleted_update_people" ON public.people
  AS RESTRICTIVE
  FOR UPDATE
  USING (deleted_at IS NULL OR public.is_super_admin());

-- Утилита для super_admin: восстановление по id
CREATE OR REPLACE FUNCTION public.restore_soft_deleted(p_table TEXT, p_id UUID)
RETURNS BOOLEAN AS $$
DECLARE n INTEGER;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'restore_soft_deleted: доступно только super_admin';
  END IF;
  IF p_table NOT IN ('initiatives', 'people') THEN
    RAISE EXCEPTION 'restore_soft_deleted: таблица % не поддерживается', p_table;
  END IF;
  EXECUTE format('UPDATE public.%I SET deleted_at = NULL WHERE id = $1', p_table) USING p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.restore_soft_deleted IS 'Снимает deleted_at с записи. Доступно только super_admin.';
