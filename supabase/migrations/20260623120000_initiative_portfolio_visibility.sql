-- Видимость инициатив в экране заполнения портфеля (2026).
-- is_portfolio_ghost: legacy / без сигнала в 2026 — не показываем в UI и каунтерах.
-- is_portfolio_completed: «завершена» — в свёрнутой секции неактивных.

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS is_portfolio_ghost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_portfolio_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.initiatives.is_portfolio_ghost IS
  'Скрыта из заполнения портфеля: legacy-строки без effort/cost в 2026. Данные в БД сохраняются.';
COMMENT ON COLUMN public.initiatives.is_portfolio_completed IS
  'Инициатива отмечена лидером как завершённая: уходит в секцию неактивных, не удаляется.';

-- Существующие строки без сигнала в 2026 → ghost (кроме стабов).
UPDATE public.initiatives i
SET is_portfolio_ghost = true,
    updated_at = timezone('utc', now())
WHERE i.deleted_at IS NULL
  AND COALESCE(i.is_timeline_stub, false) = false
  AND COALESCE(i.is_portfolio_ghost, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(i.quarterly_data, '{}'::jsonb)) AS kv(k, v)
    WHERE k ~ '^2026-Q[1-4]$'
      AND (
        COALESCE((v ->> 'effortCoefficient')::numeric, 0) > 0
        OR COALESCE((v ->> 'cost')::numeric, 0) + COALESCE((v ->> 'otherCosts')::numeric, 0) > 0
      )
  );
