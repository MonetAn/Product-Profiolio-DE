-- =============================================================================
-- Tech Platform / Frontend Guild: вернуть «нераспределённое» (стаб) = эталон 16 561 360.
-- После удаления live-инициативы с ~50% cost осталось ~8,28 млн только на стабе.
--
-- Preview: ROLLBACK. Запись: COMMIT.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  stub_id uuid := '08938c0e-7df2-44b3-849c-ddb038ba30c2';
  live_dup_id uuid := '56d6ed17-583f-4098-8e49-0922b46d6d79';
  t_q1 bigint := 4240803;
  t_q2 bigint := 4227854;
  t_q3 bigint := 3994616;
  t_q4 bigint := 4098087;
  qd jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.initiatives
    WHERE id = stub_id AND unit = 'Tech Platform' AND team = 'Frontend Guild'
  ) THEN
    RAISE EXCEPTION 'Стаб Frontend Guild не найден (id=%)', stub_id;
  END IF;

  SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd
  FROM public.initiatives WHERE id = stub_id;

  qd := qd
    || jsonb_build_object(
         '2026-Q1', coalesce(qd -> '2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', t_q1, 'otherCosts', 0),
         '2026-Q2', coalesce(qd -> '2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', t_q2, 'otherCosts', 0),
         '2026-Q3', coalesce(qd -> '2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', t_q3, 'otherCosts', 0),
         '2026-Q4', coalesce(qd -> '2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', t_q4, 'otherCosts', 0)
       );

  UPDATE public.initiatives
  SET quarterly_data = qd,
      updated_at = timezone('utc'::text, now())
  WHERE id = stub_id;

  -- Split стаба = эталон (одна строка)
  DELETE FROM public.initiative_budget_department_2026
  WHERE initiative_id = stub_id;

  INSERT INTO public.initiative_budget_department_2026 (
    initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, updated_at
  )
  VALUES (
    stub_id,
    '(из quarterly, без CSV split)',
    t_q1, t_q2, t_q3, t_q4,
    true,
    timezone('utc'::text, now())
  );

  -- Осиротевший split на live «Frontend Guild стоимость» (cost уже 0)
  DELETE FROM public.initiative_budget_department_2026
  WHERE initiative_id = live_dup_id;
END $$;

SELECT initiative, is_timeline_stub,
       round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
       ))::bigint AS y2026
FROM public.initiatives
WHERE unit = 'Tech Platform'
  AND team = 'Frontend Guild'
  AND deleted_at IS NULL
GROUP BY 1, 2
ORDER BY y2026 DESC;

SELECT
  (SELECT rub_all FROM public.team_budget_baseline_2026
   WHERE unit = 'Tech Platform' AND team = 'Frontend Guild') AS baseline,
  (
    SELECT round(sum(
      coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives
    WHERE unit = 'Tech Platform' AND team = 'Frontend Guild' AND deleted_at IS NULL
  ) AS team_live_sum;

ROLLBACK;
-- COMMIT;
