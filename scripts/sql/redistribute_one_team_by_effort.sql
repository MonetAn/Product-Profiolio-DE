-- Одна команда: пересчёт cost 2026 по % усилия + baseline (после сбоя delete в UI).
-- Измените unit / team в merge_stub_cfg, Run целиком, preview → COMMIT.

BEGIN;

DROP TABLE IF EXISTS merge_stub_cfg;
CREATE TEMP TABLE merge_stub_cfg (merge_unit text, merge_team text);
INSERT INTO merge_stub_cfg VALUES ('Tech Platform', 'Process Core Team');

-- До
SELECT b.unit, b.team, b.rub_all AS baseline,
  coalesce(t.live, 0)::bigint AS live,
  (b.rub_all - coalesce(t.live, 0))::bigint AS gap
FROM public.team_budget_baseline_2026 b
CROSS JOIN merge_stub_cfg c
LEFT JOIN (
  SELECT i.unit, i.team,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE b.unit = c.merge_unit AND b.team = c.merge_team;

-- Тот же алгоритм, что budget_2026_redistribute_all_teams_by_effort.sql, одна команда:
DO $$
DECLARE
  tr record;
  ir record;
  stub_id uuid;
  t1 numeric; t2 numeric; t3 numeric; t4 numeric;
  team_rub_all numeric;
  qd jsonb;
  c1 numeric; c2 numeric; c3 numeric; c4 numeric;
  s1 numeric; s2 numeric; s3 numeric; s4 numeric;
  r1 numeric; r2 numeric; r3 numeric; r4 numeric;
  live_year numeric;
  dust bigint;
  q4_cost numeric;
BEGIN
  SELECT b.unit, b.team, b.rub_all::numeric, b.q1::numeric, b.q2::numeric, b.q3::numeric, b.q4::numeric
  INTO tr
  FROM public.team_budget_baseline_2026 b
  CROSS JOIN merge_stub_cfg c
  WHERE b.unit = c.merge_unit AND b.team = c.merge_team;

  IF tr IS NULL THEN
    RAISE EXCEPTION 'Нет baseline для команды из merge_stub_cfg';
  END IF;

  team_rub_all := tr.rub_all;
  t1 := tr.q1; t2 := tr.q2; t3 := tr.q3; t4 := tr.q4;
  s1 := 0; s2 := 0; s3 := 0; s4 := 0;

  FOR ir IN
    SELECT id, quarterly_data,
      coalesce((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0) AS e1,
      coalesce((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0) AS e2,
      coalesce((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0) AS e3,
      coalesce((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0) AS e4
    FROM public.initiatives
    WHERE deleted_at IS NULL AND unit = tr.unit AND team = tr.team AND NOT is_timeline_stub
  LOOP
    c1 := round(ir.e1 / 100.0 * t1); c2 := round(ir.e2 / 100.0 * t2);
    c3 := round(ir.e3 / 100.0 * t3); c4 := round(ir.e4 / 100.0 * t4);
    s1 := s1 + c1; s2 := s2 + c2; s3 := s3 + c3; s4 := s4 + c4;
    qd := coalesce(ir.quarterly_data, '{}'::jsonb) || jsonb_build_object(
      '2026-Q1', coalesce(ir.quarterly_data -> '2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', c1, 'otherCosts', 0, 'costFinanceConfirmed', true),
      '2026-Q2', coalesce(ir.quarterly_data -> '2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', c2, 'otherCosts', 0, 'costFinanceConfirmed', true),
      '2026-Q3', coalesce(ir.quarterly_data -> '2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', c3, 'otherCosts', 0, 'costFinanceConfirmed', true),
      '2026-Q4', coalesce(ir.quarterly_data -> '2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', c4, 'otherCosts', 0, 'costFinanceConfirmed', true)
    );
    UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now()) WHERE id = ir.id;
  END LOOP;

  r1 := greatest(0, round(t1 - s1)); r2 := greatest(0, round(t2 - s2));
  r3 := greatest(0, round(t3 - s3)); r4 := greatest(0, round(t4 - s4));

  SELECT i.id INTO stub_id FROM public.initiatives i
  WHERE i.deleted_at IS NULL AND i.unit = tr.unit AND i.team = tr.team AND i.is_timeline_stub = true
  ORDER BY CASE WHEN i.initiative ~* '(стоимость команды|фот)' THEN 0 ELSE 1 END, i.created_at NULLS LAST LIMIT 1;

  IF stub_id IS NULL AND (r1 + r2 + r3 + r4) > 0 THEN
    INSERT INTO public.initiatives (unit, team, initiative, is_timeline_stub, stakeholders_list, description, documentation_link, stakeholders, quarterly_data, created_at, updated_at)
    VALUES (tr.unit, tr.team, 'Стоимость команды ' || tr.team || ' 2026', true, '{}'::text[], '', '', '', '{}'::jsonb, now(), now())
    RETURNING id INTO stub_id;
  END IF;

  IF stub_id IS NOT NULL THEN
    SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = stub_id;
    qd := qd || jsonb_build_object(
      '2026-Q1', coalesce(qd -> '2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', r1, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
      '2026-Q2', coalesce(qd -> '2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', r2, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
      '2026-Q3', coalesce(qd -> '2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', r3, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
      '2026-Q4', coalesce(qd -> '2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', r4, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true)
    );
    UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now()) WHERE id = stub_id;
  END IF;

  SELECT coalesce(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0) + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
    + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0) + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
  ), 0) INTO live_year FROM public.initiatives WHERE deleted_at IS NULL AND unit = tr.unit AND team = tr.team;

  dust := round(team_rub_all)::bigint - round(live_year)::bigint;
  IF dust <> 0 AND stub_id IS NOT NULL THEN
    SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd FROM public.initiatives WHERE id = stub_id;
    q4_cost := coalesce((qd #>> '{2026-Q4,cost}')::numeric, 0) + dust;
    qd := jsonb_set(coalesce(qd, '{}'::jsonb), '{2026-Q4}',
      coalesce(qd -> '2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', greatest(0, q4_cost), 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true), true);
    UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now()) WHERE id = stub_id;
  END IF;
END $$;

-- После
SELECT b.unit, b.team, b.rub_all AS baseline,
  coalesce(t.live, 0)::bigint AS live,
  (b.rub_all - coalesce(t.live, 0))::bigint AS gap
FROM public.team_budget_baseline_2026 b
CROSS JOIN merge_stub_cfg c
LEFT JOIN (
  SELECT i.unit, i.team,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE b.unit = c.merge_unit AND b.team = c.merge_team;

ROLLBACK;
-- COMMIT;
