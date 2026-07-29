-- Ручной процент RUN для командного представления аллокаций.
-- NULL сохраняет текущий автоматический расчёт.

ALTER TABLE public.location_allocation_team_metrics
  ADD COLUMN IF NOT EXISTS run_percent_override numeric(6, 2) NULL
    CHECK (
      run_percent_override IS NULL
      OR (
        run_percent_override >= 0
        AND run_percent_override <= 100
      )
    );

COMMENT ON COLUMN public.location_allocation_team_metrics.run_percent_override IS
  'Ручной процент RUN в командном представлении. NULL означает автоматический расчёт.';
