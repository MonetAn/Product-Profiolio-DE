-- Доп. снимок split ПЕРЕД PnL scale. Не трогает _backup_*_20260518.
BEGIN;

DROP TABLE IF EXISTS public._backup_split_pre_pnl_20260518;
CREATE TABLE public._backup_split_pre_pnl_20260518 AS
SELECT b.*
FROM public.initiative_budget_department_2026 b
INNER JOIN public.initiatives i ON i.id = b.initiative_id AND i.deleted_at IS NULL;

SELECT
  count(*)::int AS pre_pnl_split_rows,
  round(sum(q1 + q2 + q3 + q4))::bigint AS pre_pnl_sum_split,
  round(sum(q1 + q2 + q3 + q4) FILTER (WHERE is_in_pnl_it))::bigint AS pre_pnl_sum_split_pnl
FROM public._backup_split_pre_pnl_20260518;

COMMIT;
