-- Разбивка бюджета 2026 по бюджетным подразделениям (строки CSV: инициатива + департамент).
-- Приложение: если у инициативы есть строки здесь, calculateBudget() использует их вместо initiatives.quarterly_data.

CREATE TABLE IF NOT EXISTS public.initiative_budget_department_2026 (
  initiative_id uuid NOT NULL REFERENCES public.initiatives (id) ON DELETE CASCADE,
  budget_department text NOT NULL,
  q1 numeric NOT NULL DEFAULT 0,
  q2 numeric NOT NULL DEFAULT 0,
  q3 numeric NOT NULL DEFAULT 0,
  q4 numeric NOT NULL DEFAULT 0,
  is_in_pnl_it boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (initiative_id, budget_department)
);

CREATE INDEX IF NOT EXISTS idx_initiative_budget_dept_2026_initiative
  ON public.initiative_budget_department_2026 (initiative_id);

ALTER TABLE public.initiative_budget_department_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dodo employees can view initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can insert initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can update initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can delete initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;

CREATE POLICY "Dodo employees can view initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR SELECT TO authenticated
  USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can insert initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR INSERT TO authenticated
  WITH CHECK (public.is_dodo_employee());

CREATE POLICY "Dodo employees can update initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR UPDATE TO authenticated
  USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can delete initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR DELETE TO authenticated
  USING (public.is_dodo_employee());
