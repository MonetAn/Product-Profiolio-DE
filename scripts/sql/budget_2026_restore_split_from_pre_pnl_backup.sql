-- Откат только split к состоянию перед PnL scale (_backup_split_pre_pnl_20260518).
-- Не трогает _backup_*_20260518 и initiatives.quarterly_data.

BEGIN;

TRUNCATE public.initiative_budget_department_2026;

INSERT INTO public.initiative_budget_department_2026 (
  initiative_id,
  budget_department,
  q1,
  q2,
  q3,
  q4,
  is_in_pnl_it,
  created_at,
  updated_at
)
SELECT
  initiative_id,
  budget_department,
  q1,
  q2,
  q3,
  q4,
  is_in_pnl_it,
  created_at,
  updated_at
FROM public._backup_split_pre_pnl_20260518;

SELECT
  round(sum(q1 + q2 + q3 + q4))::bigint AS sum_split,
  round(sum(q1 + q2 + q3 + q4) FILTER (WHERE is_in_pnl_it))::bigint AS sum_split_pnl
FROM public.initiative_budget_department_2026 b
JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL;

-- COMMIT;
ROLLBACK;
