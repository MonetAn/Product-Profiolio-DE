-- =============================================================================
-- Сверка сумм 2026 с тем, как дашборд считает бюджет (initiative_budget_department_2026).
--
-- В UI (FilterBar): сумма = по строкам initiatives, calculateBudget():
--   • если у инициативы есть строки в initiative_budget_department_2026 — берётся
--     только они (игнорируется JSON quarterly_data для cost);
--   • иначе — cost+otherCosts из quarterly_data по выбранным кварталам.
--
-- Super admin: «без sensitive» = те же правила, но строки initiatives с unit/team
-- из sensitive_scopes отфильтрованы (как displayData в Index.tsx).
--
-- Подставьте роль postgres / service role. Функция is_sensitive_unit_team — из миграции
-- super_admin_sensitive_scopes (если её нет, блок «без sensitive» пропустите).
-- =============================================================================

-- 1) Всё по таблице разбивки (как «полные» данные по департаментам, без учёта sensitive)
SELECT
  round(sum(q1 + q2 + q3 + q4))::bigint AS total_all_rows_rub,
  round(sum(CASE WHEN is_in_pnl_it THEN q1 + q2 + q3 + q4 ELSE 0 END))::bigint AS total_pnl_it_only_rub
FROM public.initiative_budget_department_2026;

-- 2) Только инициативы, у которых вообще есть разбивка (как в приложении: по id из join)
SELECT
  round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint AS total_all_rows_rub,
  round(sum(CASE WHEN b.is_in_pnl_it THEN b.q1 + b.q2 + b.q3 + b.q4 ELSE 0 END))::bigint AS total_pnl_it_only_rub
FROM public.initiative_budget_department_2026 b
INNER JOIN public.initiatives i ON i.id = b.initiative_id
WHERE coalesce(i.is_timeline_stub, false) = false;

-- 3) «Без sensitive» — те же суммы, что ориентировочно видит super admin без галочки на тримапе
SELECT
  round(sum(b.q1 + b.q2 + b.q3 + b.q4))::bigint AS total_all_rows_no_sensitive_rub,
  round(sum(CASE WHEN b.is_in_pnl_it THEN b.q1 + b.q2 + b.q3 + b.q4 ELSE 0 END))::bigint AS total_pnl_no_sensitive_rub
FROM public.initiative_budget_department_2026 b
INNER JOIN public.initiatives i ON i.id = b.initiative_id
WHERE coalesce(i.is_timeline_stub, false) = false
  AND NOT public.is_sensitive_unit_team(i.unit, i.team);

-- 4) Инициативы с разбивкой vs без (если без — UI падает обратно на quarterly_data)
WITH has_split AS (
  SELECT DISTINCT initiative_id FROM public.initiative_budget_department_2026
)
SELECT
  (SELECT count(*) FROM has_split) AS initiatives_with_department_split,
  (SELECT count(*) FROM public.initiatives WHERE coalesce(is_timeline_stub, false) = false) AS initiatives_non_stub,
  (SELECT count(*) FROM public.initiatives i WHERE coalesce(i.is_timeline_stub, false) = false AND NOT EXISTS (
    SELECT 1 FROM has_split h WHERE h.initiative_id = i.id
  )) AS non_stub_without_split;
