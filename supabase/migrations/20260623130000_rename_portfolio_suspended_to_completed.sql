-- Переименование is_portfolio_suspended → is_portfolio_completed (опечатка «завешена» → «завершена»).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'initiatives'
      AND column_name = 'is_portfolio_suspended'
  ) THEN
    ALTER TABLE public.initiatives
      RENAME COLUMN is_portfolio_suspended TO is_portfolio_completed;
  END IF;
END $$;

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS is_portfolio_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.initiatives.is_portfolio_completed IS
  'Инициатива отмечена лидером как завершённая: уходит в секцию неактивных, не удаляется.';
