-- Пересчёт cost 2026 по командам с baseline: cost = round(eff/100 · Tq), остаток — на ОДИН стаб.
-- Цель: sum(live) по каждой команде = rub_all; sum(live) по портфелю ≈ sum(team_budget_baseline_2026).
--
-- Preview: ROLLBACK. Запись: COMMIT только если portfolio_gap ≈ 0 И sum_team_gap ≈ 0.
-- Если portfolio_gap ≈ sum(list1_all − sum_baseline_all) — см. budget_2026_reconcile_to_list1_anchor.sql.

BEGIN;

SELECT
  'before' AS phase,
  2111435636::bigint AS list1_all,
  (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS sum_baseline_all,
  2111435636 - (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS anchor_minus_baselines,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives WHERE deleted_at IS NULL
  ) AS portfolio_live,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives WHERE deleted_at IS NULL
  ) AS portfolio_gap;

-- Команды вне baseline → cost 2026 = 0 (не входят в LIST1)
UPDATE public.initiatives i
SET quarterly_data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,cost}', '0'::jsonb, true),
          '{2026-Q2,cost}', '0'::jsonb, true
        ),
        '{2026-Q3,cost}', '0'::jsonb, true
      ),
      '{2026-Q4,cost}', '0'::jsonb, true
    ),
    updated_at = timezone('utc'::text, now())
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 b
    WHERE b.unit = i.unit AND b.team = i.team
  );

DO $$
DECLARE
  tr record;
  ir record;
  stub_id uuid;
  t1 numeric; t2 numeric; t3 numeric; t4 numeric;
  qd jsonb;
  c1 numeric; c2 numeric; c3 numeric; c4 numeric;
  s1 numeric; s2 numeric; s3 numeric; s4 numeric;
  r1 numeric; r2 numeric; r3 numeric; r4 numeric;
  live_year numeric;
  dust bigint;
  q4_cost numeric;
  team_rub_all numeric;
BEGIN
  FOR tr IN
    SELECT
      b.unit,
      b.team,
      b.rub_all::numeric AS team_rub_all,
      b.q1::numeric AS t1,
      b.q2::numeric AS t2,
      b.q3::numeric AS t3,
      b.q4::numeric AS t4
    FROM public.team_budget_baseline_2026 b
  LOOP
    team_rub_all := tr.team_rub_all;
    t1 := tr.t1; t2 := tr.t2; t3 := tr.t3; t4 := tr.t4;
    s1 := 0; s2 := 0; s3 := 0; s4 := 0;

    FOR ir IN
      SELECT id, quarterly_data,
        coalesce((quarterly_data #>> '{2026-Q1,effortCoefficient}')::numeric, 0) AS e1,
        coalesce((quarterly_data #>> '{2026-Q2,effortCoefficient}')::numeric, 0) AS e2,
        coalesce((quarterly_data #>> '{2026-Q3,effortCoefficient}')::numeric, 0) AS e3,
        coalesce((quarterly_data #>> '{2026-Q4,effortCoefficient}')::numeric, 0) AS e4
      FROM public.initiatives
      WHERE deleted_at IS NULL
        AND unit = tr.unit AND team = tr.team
        AND NOT is_timeline_stub
    LOOP
      c1 := round(ir.e1 / 100.0 * t1);
      c2 := round(ir.e2 / 100.0 * t2);
      c3 := round(ir.e3 / 100.0 * t3);
      c4 := round(ir.e4 / 100.0 * t4);
      s1 := s1 + c1; s2 := s2 + c2; s3 := s3 + c3; s4 := s4 + c4;

      qd := coalesce(ir.quarterly_data, '{}'::jsonb)
        || jsonb_build_object(
             '2026-Q1', coalesce(ir.quarterly_data -> '2026-Q1', '{}'::jsonb)
               || jsonb_build_object('cost', c1, 'otherCosts', 0, 'costFinanceConfirmed', true),
             '2026-Q2', coalesce(ir.quarterly_data -> '2026-Q2', '{}'::jsonb)
               || jsonb_build_object('cost', c2, 'otherCosts', 0, 'costFinanceConfirmed', true),
             '2026-Q3', coalesce(ir.quarterly_data -> '2026-Q3', '{}'::jsonb)
               || jsonb_build_object('cost', c3, 'otherCosts', 0, 'costFinanceConfirmed', true),
             '2026-Q4', coalesce(ir.quarterly_data -> '2026-Q4', '{}'::jsonb)
               || jsonb_build_object('cost', c4, 'otherCosts', 0, 'costFinanceConfirmed', true)
           );
      UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
      WHERE id = ir.id;
    END LOOP;

    r1 := greatest(0, round(t1 - s1));
    r2 := greatest(0, round(t2 - s2));
    r3 := greatest(0, round(t3 - s3));
    r4 := greatest(0, round(t4 - s4));

    SELECT i.id INTO stub_id
    FROM public.initiatives i
    WHERE i.deleted_at IS NULL
      AND i.unit = tr.unit AND i.team = tr.team
      AND i.is_timeline_stub = true
    ORDER BY
      CASE WHEN i.initiative ~* '(стоимость команды|фот)' THEN 0 ELSE 1 END,
      CASE WHEN i.initiative ~* '2026' THEN 0 ELSE 1 END,
      i.created_at NULLS LAST,
      i.initiative
    LIMIT 1;

    IF stub_id IS NULL AND (r1 + r2 + r3 + r4) > 0 THEN
      INSERT INTO public.initiatives (
        unit, team, initiative, is_timeline_stub,
        stakeholders_list, description, documentation_link, stakeholders,
        quarterly_data, created_at, updated_at
      ) VALUES (
        tr.unit, tr.team,
        'Стоимость команды ' || tr.team || ' 2026',
        true, '{}'::text[], '', '', '', '{}'::jsonb,
        timezone('utc'::text, now()), timezone('utc'::text, now())
      )
      RETURNING id INTO stub_id;
    END IF;

    IF stub_id IS NOT NULL THEN
      SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd
      FROM public.initiatives WHERE id = stub_id;

      qd := qd || jsonb_build_object(
        '2026-Q1', coalesce(qd -> '2026-Q1', '{}'::jsonb)
          || jsonb_build_object('cost', r1, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
        '2026-Q2', coalesce(qd -> '2026-Q2', '{}'::jsonb)
          || jsonb_build_object('cost', r2, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
        '2026-Q3', coalesce(qd -> '2026-Q3', '{}'::jsonb)
          || jsonb_build_object('cost', r3, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true),
        '2026-Q4', coalesce(qd -> '2026-Q4', '{}'::jsonb)
          || jsonb_build_object('cost', r4, 'otherCosts', 0, 'effortCoefficient', 0, 'costFinanceConfirmed', true)
      );

      UPDATE public.initiatives SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
      WHERE id = stub_id;
    END IF;

    -- Дубли-стабы и лишние стабы: cost = 0 (остаток только на keeper)
    UPDATE public.initiatives i
    SET quarterly_data = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,cost}', '0'::jsonb, true),
              '{2026-Q2,cost}', '0'::jsonb, true
            ),
            '{2026-Q3,cost}', '0'::jsonb, true
          ),
          '{2026-Q4,cost}', '0'::jsonb, true
        ),
        updated_at = timezone('utc'::text, now())
    WHERE i.deleted_at IS NULL
      AND i.unit = tr.unit AND i.team = tr.team
      AND i.is_timeline_stub = true
      AND (stub_id IS NULL OR i.id <> stub_id);

    -- Пыль округления (типично ± несколько тысяч ₽/команда) → Q4 стaba
    SELECT coalesce(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ), 0) INTO live_year
    FROM public.initiatives
    WHERE deleted_at IS NULL AND unit = tr.unit AND team = tr.team;

    dust := round(team_rub_all)::bigint - round(live_year)::bigint;

    -- Σeff=100% и r1..r4=0 → стaba нет, но годовая пыль >0 (типично AI Lab ~7k)
    IF stub_id IS NULL AND dust <> 0 THEN
      INSERT INTO public.initiatives (
        unit, team, initiative, is_timeline_stub,
        stakeholders_list, description, documentation_link, stakeholders,
        quarterly_data, created_at, updated_at
      ) VALUES (
        tr.unit, tr.team,
        'Стоимость команды ' || tr.team || ' 2026',
        true, '{}'::text[], '', '', '', '{}'::jsonb,
        timezone('utc'::text, now()), timezone('utc'::text, now())
      )
      RETURNING id INTO stub_id;
    END IF;

    IF dust <> 0 AND stub_id IS NOT NULL THEN
      SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd
      FROM public.initiatives WHERE id = stub_id;
      q4_cost := coalesce((qd #>> '{2026-Q4,cost}')::numeric, 0) + dust;
      qd := jsonb_set(
        coalesce(qd, '{}'::jsonb),
        '{2026-Q4}',
        coalesce(qd -> '2026-Q4', '{}'::jsonb)
          || jsonb_build_object(
               'cost', greatest(0, q4_cost),
               'otherCosts', 0,
               'effortCoefficient', 0,
               'costFinanceConfirmed', true
             ),
        true
      );
      UPDATE public.initiatives
      SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
      WHERE id = stub_id;
    ELSIF dust <> 0 AND stub_id IS NULL THEN
      -- fallback: нет стaba — на инициативу с max cost за год
      UPDATE public.initiatives i
      SET quarterly_data = jsonb_set(
            coalesce(i.quarterly_data, '{}'::jsonb),
            '{2026-Q4}',
            coalesce(i.quarterly_data -> '2026-Q4', '{}'::jsonb)
              || jsonb_build_object(
                   'cost',
                   coalesce((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0) + dust,
                   'costFinanceConfirmed', true
                 ),
            true
          ),
          updated_at = timezone('utc'::text, now())
      WHERE i.id = (
        SELECT i2.id
        FROM public.initiatives i2
        WHERE i2.deleted_at IS NULL
          AND i2.unit = tr.unit AND i2.team = tr.team
          AND NOT i2.is_timeline_stub
        ORDER BY (
          COALESCE((i2.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
          + COALESCE((i2.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
          + COALESCE((i2.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
          + COALESCE((i2.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
        ) DESC
        LIMIT 1
      );
    END IF;
  END LOOP;
END $$;

-- Финальная доводка: rub_all vs live (на случай rub_all <> q1+q2+q3+q4 или INSERT стaba)
DO $$
DECLARE
  r record;
  stub_id uuid;
  init_id uuid;
  qd jsonb;
  dust bigint;
  q4_cost numeric;
BEGIN
  FOR r IN
    SELECT
      b.unit,
      b.team,
      b.rub_all::bigint AS team_rub_all,
      coalesce(t.live_year, 0)::bigint AS live_year
    FROM public.team_budget_baseline_2026 b
    LEFT JOIN (
      SELECT i.unit, i.team,
        round(sum(
          COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
        ))::bigint AS live_year
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
      GROUP BY i.unit, i.team
    ) t ON t.unit = b.unit AND t.team = b.team
    WHERE abs(b.rub_all - coalesce(t.live_year, 0)) >= 1
  LOOP
    dust := r.team_rub_all - r.live_year;
    IF dust = 0 THEN
      CONTINUE;
    END IF;

    SELECT i.id INTO stub_id
    FROM public.initiatives i
    WHERE i.deleted_at IS NULL
      AND i.unit = r.unit AND i.team = r.team
      AND i.is_timeline_stub = true
    ORDER BY
      CASE WHEN i.initiative ~* '(стоимость команды|фот)' THEN 0 ELSE 1 END,
      i.created_at NULLS LAST
    LIMIT 1;

    IF stub_id IS NULL THEN
      INSERT INTO public.initiatives (
        unit, team, initiative, is_timeline_stub,
        stakeholders_list, description, documentation_link, stakeholders,
        quarterly_data, created_at, updated_at
      ) VALUES (
        r.unit, r.team,
        'Стоимость команды ' || r.team || ' 2026',
        true, '{}'::text[], '', '', '', '{}'::jsonb,
        timezone('utc'::text, now()), timezone('utc'::text, now())
      )
      RETURNING id INTO stub_id;
    END IF;

    IF stub_id IS NOT NULL THEN
      SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd
      FROM public.initiatives WHERE id = stub_id;
      q4_cost := coalesce((qd #>> '{2026-Q4,cost}')::numeric, 0) + dust;
      IF q4_cost >= 0 THEN
        qd := jsonb_set(
          coalesce(qd, '{}'::jsonb),
          '{2026-Q4}',
          coalesce(qd -> '2026-Q4', '{}'::jsonb)
            || jsonb_build_object(
                 'cost', q4_cost,
                 'otherCosts', 0,
                 'effortCoefficient', 0,
                 'costFinanceConfirmed', true
               ),
          true
        );
        UPDATE public.initiatives
        SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
        WHERE id = stub_id;
        dust := 0;
      ELSE
        qd := jsonb_set(
          coalesce(qd, '{}'::jsonb),
          '{2026-Q4}',
          coalesce(qd -> '2026-Q4', '{}'::jsonb)
            || jsonb_build_object(
                 'cost', 0,
                 'otherCosts', 0,
                 'effortCoefficient', 0,
                 'costFinanceConfirmed', true
               ),
          true
        );
        UPDATE public.initiatives
        SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
        WHERE id = stub_id;
        dust := (-q4_cost)::bigint;
      END IF;
    END IF;

    IF dust <> 0 THEN
      SELECT i2.id INTO init_id
      FROM public.initiatives i2
      WHERE i2.deleted_at IS NULL
        AND i2.unit = r.unit AND i2.team = r.team
        AND NOT i2.is_timeline_stub
      ORDER BY (
        COALESCE((i2.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
        + COALESCE((i2.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
        + COALESCE((i2.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
        + COALESCE((i2.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
      ) DESC
      LIMIT 1;

      IF init_id IS NOT NULL THEN
        SELECT coalesce(quarterly_data, '{}'::jsonb) INTO qd
        FROM public.initiatives WHERE id = init_id;
        q4_cost := greatest(0, coalesce((qd #>> '{2026-Q4,cost}')::numeric, 0) + dust);
        qd := jsonb_set(
          coalesce(qd, '{}'::jsonb),
          '{2026-Q4}',
          coalesce(qd -> '2026-Q4', '{}'::jsonb)
            || jsonb_build_object('cost', q4_cost, 'costFinanceConfirmed', true),
          true
        );
        UPDATE public.initiatives
        SET quarterly_data = qd, updated_at = timezone('utc'::text, now())
        WHERE id = init_id;
      END IF;
    END IF;
  END LOOP;
END $$;

DELETE FROM public.initiative_budget_department_2026 b
USING public.initiatives i
WHERE b.initiative_id = i.id
  AND i.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 t
    WHERE t.unit = i.unit AND t.team = i.team
  );

INSERT INTO public.initiative_budget_department_2026 (
  initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, updated_at
)
SELECT
  i.id,
  '(из quarterly, без CSV split)',
  coalesce((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)::bigint,
  coalesce((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)::bigint,
  coalesce((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)::bigint,
  coalesce((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)::bigint,
  true,
  timezone('utc'::text, now())
FROM public.initiatives i
WHERE i.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.team_budget_baseline_2026 t
    WHERE t.unit = i.unit AND t.team = i.team
  );

-- --- После ---
SELECT
  'after' AS phase,
  2111435636::bigint AS list1_all,
  (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS sum_baseline_all,
  2111435636 - (SELECT round(sum(rub_all))::bigint FROM public.team_budget_baseline_2026) AS anchor_minus_baselines,
  (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives WHERE deleted_at IS NULL
  ) AS portfolio_live,
  2111435636 - (
    SELECT round(sum(
      COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint
    FROM public.initiatives WHERE deleted_at IS NULL
  ) AS portfolio_gap;

-- Команды с расхождением > 1000 ₽ (если пусто — все OK). Не «только Data Office»:
-- скрипт обрабатывает ВСЕ строки team_budget_baseline_2026; здесь только проблемные.
SELECT
  b.unit,
  b.team,
  b.rub_all AS baseline_year,
  coalesce(t.live_year, 0)::bigint AS live_year,
  (b.rub_all - coalesce(t.live_year, 0))::bigint AS team_gap
FROM public.team_budget_baseline_2026 b
LEFT JOIN (
  SELECT i.unit, i.team,
    round(sum(
      COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
      + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
    ))::bigint AS live_year
  FROM public.initiatives i
  WHERE i.deleted_at IS NULL
  GROUP BY i.unit, i.team
) t ON t.unit = b.unit AND t.team = b.team
WHERE abs(b.rub_all - coalesce(t.live_year, 0)) > 1000
ORDER BY abs(b.rub_all - coalesce(t.live_year, 0)) DESC
LIMIT 25;

-- Сводка: сколько команд в baseline и сколько без расхождений
SELECT
  (SELECT count(*) FROM public.team_budget_baseline_2026) AS teams_in_baseline,
  (
    SELECT count(*)
    FROM public.team_budget_baseline_2026 b
    LEFT JOIN (
      SELECT i.unit, i.team,
        round(sum(
          COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
        ))::bigint AS live_year
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
      GROUP BY i.unit, i.team
    ) t ON t.unit = b.unit AND t.team = b.team
    WHERE abs(b.rub_all - coalesce(t.live_year, 0)) <= 1
  ) AS teams_exact_match,
  (
    SELECT count(*)
    FROM public.team_budget_baseline_2026 b
    LEFT JOIN (
      SELECT i.unit, i.team,
        round(sum(
          COALESCE((i.quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
          + COALESCE((i.quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
        ))::bigint AS live_year
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
      GROUP BY i.unit, i.team
    ) t ON t.unit = b.unit AND t.team = b.team
    WHERE abs(b.rub_all - coalesce(t.live_year, 0)) <= 1000
  ) AS teams_ok_within_1k;

ROLLBACK;
-- COMMIT;
