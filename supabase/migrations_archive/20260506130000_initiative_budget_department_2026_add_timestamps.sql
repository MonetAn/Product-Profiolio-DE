-- Таблица initiative_budget_department_2026 могла быть создана вручную без
-- created_at / updated_at. CREATE TABLE IF NOT EXISTS не добавляет колонки к уже
-- существующей таблице — поэтому догоняем схему безопасными ALTER.

ALTER TABLE public.initiative_budget_department_2026
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.initiative_budget_department_2026
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());
