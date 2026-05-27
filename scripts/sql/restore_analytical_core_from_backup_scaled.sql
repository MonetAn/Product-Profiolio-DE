-- =============================================================================
-- Data Office / Analytical Core: восстановить распределение из бэкапа 2026-05-19
-- с масштабом cost до эталона команды 40 165 895 ₽ (LIST1 «ФОТ кор команды»).
--
-- Восстанавливает из _backup_initiatives_quarterly_20260519:
--   effortCoefficient, comment, onTrack, support, metricPlan, metricFact,
--   costFinanceConfirmed, otherCosts (=0), cost по кварталам (× scale).
-- Стаб «Стоимость команды кор команды» — как в бэкапе (~1 ₽), не 40 млн.
--
-- Не трогает AI Lab и baseline. После COMMIT (опционально):
--   budget_2026_sync_split_from_quarterly.sql
--
-- Supabase SQL Editor: весь файл одним Run.
-- Preview: ROLLBACK в конце. Запись: COMMIT.
-- =============================================================================

-- ── BEFORE ────────────────────────────────────────────────────────────
SELECT team, initiative, is_timeline_stub,
       round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
       ))::bigint AS y2026,
       round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0)
       ))::int AS effort_sum
FROM public.initiatives
WHERE unit = 'Data Office'
  AND team = 'Analytical Core'
  AND deleted_at IS NULL
GROUP BY 1, 2, 3
ORDER BY y2026 DESC, initiative;

BEGIN;

DO $$
DECLARE
  const_target bigint := 40165895;
  backup_live numeric;
  scale_f numeric;
  r record;
  q text;
  qd jsonb;
  qd_out jsonb;
  q_backup jsonb;
  c numeric;
  quarters text[] := ARRAY['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];
BEGIN
  IF to_regclass('public._backup_initiatives_quarterly_20260519') IS NULL THEN
    RAISE EXCEPTION 'Нет таблицы _backup_initiatives_quarterly_20260519 — сначала budget_2026_backup_snapshot_20260519_list1_aligned.sql';
  END IF;

  SELECT coalesce(sum(
    coalesce((b.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + coalesce((b.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + coalesce((b.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + coalesce((b.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ), 0)
  INTO backup_live
  FROM public._backup_initiatives_quarterly_20260519 b
  WHERE b.unit = 'Data Office'
    AND b.team = 'Analytical Core'
    AND NOT coalesce(b.is_timeline_stub, false);

  IF backup_live <= 0 THEN
    RAISE EXCEPTION 'backup_live=0, нечего масштабировать';
  END IF;

  scale_f := const_target::numeric / backup_live;

  -- Live-инициативы: кварталы из бэкапа, cost × scale_f
  FOR r IN
    SELECT i.id, b.quarterly_data AS qd_backup, b.is_timeline_stub
    FROM public.initiatives i
    INNER JOIN public._backup_initiatives_quarterly_20260519 b ON b.id = i.id
    WHERE i.unit = 'Data Office'
      AND i.team = 'Analytical Core'
      AND i.deleted_at IS NULL
      AND NOT coalesce(i.is_timeline_stub, false)
  LOOP
    SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = r.id;

    FOREACH q IN ARRAY quarters LOOP
      q_backup := coalesce(r.qd_backup -> q, '{}'::jsonb);
      c := round(coalesce((q_backup ->> 'cost')::numeric, 0) * scale_f);
      qd_out :=
        q_backup
        || jsonb_build_object(
             'cost', c,
             'otherCosts', 0,
             'costFinanceConfirmed', coalesce(q_backup -> 'costFinanceConfirmed', 'true'::jsonb)
           );
      qd := jsonb_set(coalesce(qd, '{}'::jsonb), ARRAY[q], qd_out, true);
    END LOOP;

    UPDATE public.initiatives
    SET quarterly_data = qd,
        updated_at = timezone('utc'::text, now())
    WHERE id = r.id;
  END LOOP;

  -- Стаб: полный quarterly_data из бэкапа (≈1 ₽ на год)
  FOR r IN
    SELECT i.id, b.quarterly_data AS qd_backup
    FROM public.initiatives i
    INNER JOIN public._backup_initiatives_quarterly_20260519 b ON b.id = i.id
    WHERE i.unit = 'Data Office'
      AND i.team = 'Analytical Core'
      AND i.initiative = 'Стоимость команды кор команды'
      AND coalesce(i.is_timeline_stub, false) = true
      AND i.deleted_at IS NULL
  LOOP
    UPDATE public.initiatives
    SET quarterly_data = r.qd_backup,
        updated_at = timezone('utc'::text, now())
    WHERE id = r.id;
  END LOOP;
END $$;

-- Копейки: довести sum(live cost) до 40 165 895 на инициативе с max годом
DO $$
DECLARE
  const_target bigint := 40165895;
  cur_sum bigint;
  delta bigint;
  fix_id uuid;
  qd jsonb;
  q4_cost numeric;
BEGIN
  SELECT round(coalesce(sum(
    coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ), 0))::bigint
  INTO cur_sum
  FROM public.initiatives
  WHERE unit = 'Data Office'
    AND team = 'Analytical Core'
    AND deleted_at IS NULL
    AND NOT coalesce(is_timeline_stub, false);

  delta := const_target - cur_sum;
  IF delta = 0 THEN
    RETURN;
  END IF;

  SELECT i.id
  INTO fix_id
  FROM public.initiatives i
  WHERE i.unit = 'Data Office'
    AND i.team = 'Analytical Core'
    AND i.deleted_at IS NULL
    AND NOT coalesce(i.is_timeline_stub, false)
  ORDER BY (
    coalesce((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
    + coalesce((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + coalesce((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
    + coalesce((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ) DESC
  LIMIT 1;

  SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = fix_id;
  q4_cost := coalesce((qd #>> '{2026-Q4,cost}')::numeric, 0) + delta;
  qd := jsonb_set(qd, '{2026-Q4,cost}', to_jsonb(q4_cost), true);

  UPDATE public.initiatives
  SET quarterly_data = qd,
      updated_at = timezone('utc'::text, now())
  WHERE id = fix_id;
END $$;

-- ── AFTER ─────────────────────────────────────────────────────────────
SELECT team, initiative, is_timeline_stub,
       round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
       ))::bigint AS y2026,
       round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0)
       ))::int AS effort_sum
FROM public.initiatives
WHERE unit = 'Data Office'
  AND team = 'Analytical Core'
  AND deleted_at IS NULL
GROUP BY 1, 2, 3
HAVING round(sum(
         coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
         + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
       )) > 0
ORDER BY y2026 DESC, initiative;

SELECT
  40165895::bigint AS target_team_rub,
  (
    SELECT round(coalesce(sum(
      coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ), 0))::bigint
    FROM public.initiatives
    WHERE unit = 'Data Office'
      AND team = 'Analytical Core'
      AND deleted_at IS NULL
      AND NOT coalesce(is_timeline_stub, false)
  ) AS live_non_stub_sum,
  (
    SELECT round(coalesce(sum(
      coalesce((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + coalesce((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ), 0))::bigint
    FROM public.initiatives
    WHERE unit = 'Data Office'
      AND team = 'Analytical Core'
      AND deleted_at IS NULL
      AND coalesce(is_timeline_stub, false)
  ) AS stub_sum;

ROLLBACK;
-- COMMIT;
