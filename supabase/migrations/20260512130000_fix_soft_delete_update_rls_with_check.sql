-- RESTRICTIVE UPDATE: неявный WITH CHECK совпадал с USING → 403 на soft delete для не-super_admin.
-- Явный WITH CHECK (true): ограничение «только активные строки» остаётся в USING.
--
-- ALTER вместо DROP+CREATE: один шаг на таблицу, короче критическая секция блокировок.
-- Если SQL Editor всё ещё таймаутит — см. комментарий в docs или пауза проекта / off-hours.

ALTER POLICY "hide_soft_deleted_update_initiatives" ON public.initiatives
  WITH CHECK (true);

ALTER POLICY "hide_soft_deleted_update_people" ON public.people
  WITH CHECK (true);
