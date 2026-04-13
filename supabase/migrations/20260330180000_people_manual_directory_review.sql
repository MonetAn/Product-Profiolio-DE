-- Ручное добавление людей (не из выгрузки) + проверка админом
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS directory_source text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS manual_added_by uuid,
  ADD COLUMN IF NOT EXISTS manual_added_by_name text,
  ADD COLUMN IF NOT EXISTS manual_review_status text,
  ADD COLUMN IF NOT EXISTS manual_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS manual_resolved_by_name text;

COMMENT ON COLUMN public.people.directory_source IS 'import — из выгрузки/импорта; manual — добавлено пользователем из UI';
COMMENT ON COLUMN public.people.manual_review_status IS 'pending — ждёт проверки админа; resolved — подтверждено; NULL — не применимо (импорт)';

ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_directory_source_chk;
ALTER TABLE public.people
  ADD CONSTRAINT people_directory_source_chk
  CHECK (directory_source IN ('import', 'manual'));

ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_manual_review_status_chk;
ALTER TABLE public.people
  ADD CONSTRAINT people_manual_review_status_chk
  CHECK (manual_review_status IS NULL OR manual_review_status IN ('pending', 'resolved'));
