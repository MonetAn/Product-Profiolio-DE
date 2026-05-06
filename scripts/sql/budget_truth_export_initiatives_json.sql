-- Выгрузка initiatives в один JSON-массив для аргумента --db-json скрипта reconcile-budget-csv.mjs
-- (генерация файла *-updates.sql). Таблица _budget_truth_csv для этого не нужна.
--
-- Результат может быть очень большим; при таймауте в Dashboard используйте psql или снимите лимит.

SELECT json_agg(row_to_json(x))
FROM (
  SELECT
    id,
    initiative,
    unit,
    team,
    quarterly_data
  FROM public.initiatives
  WHERE COALESCE(is_timeline_stub, false) = false
) x;
