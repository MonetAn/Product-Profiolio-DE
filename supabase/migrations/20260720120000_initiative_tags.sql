-- Единый набор продуктовых/технических тегов на инициативе.
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.initiatives.tags IS
  'Мультивыбор тегов инициативы из фиксированного справочника приложения.';
