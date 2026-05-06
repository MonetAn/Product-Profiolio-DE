-- FAP. Этап 1.
--   1) Возвращаем cost инициативе "Редизайн DodoBrands.io" (FAP/SOM):
--      она была обнулена в ghost-cleanup, но по новому FAP CSV у неё есть коэффициент 10% в Q1.
--      Cost из CSV "Инициативы 2.0 по бюджету": IT.FAP.Management = 137 237/136 598/129 540/133 038.
--      Эти суммы у стуба SOM забираем (стуб поглотил их при ghost-cleanup) и переносим обратно
--      на инициативу. Total в БД сохраняется.
--
--   2) Ставим effortCoefficient у 27 FAP-инициатив, у которых нашлось совпадение по имени с FAP-CSV.
--      Stub'ы и недостающие в БД инициативы НЕ трогаем — про них поговорим отдельно (этап 2).
--
-- preview: scripts/db-psql.sh -f scripts/sql/fap_apply_coefficients_phase1.sql
-- запись:  замени ROLLBACK на COMMIT в конце.

\set ON_ERROR_STOP on

\echo '── BEFORE: Редизайн DodoBrands.io и стуб SOM ────────────────────────'
SELECT i.unit, i.team, i.initiative, i.is_timeline_stub,
       ROUND(COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0)) AS y26
FROM public.initiatives i
WHERE i.id IN ('0dd9bd4c-6f66-4d55-ad1d-12d65062383c','2e698528-3369-45c3-b4cb-7f4b8f31b013')
ORDER BY i.is_timeline_stub DESC;

BEGIN;

-- =====================================================================
-- 1) ВОССТАНОВЛЕНИЕ cost у Редизайн DodoBrands.io
-- =====================================================================

-- 1.1) Уменьшаем строку стуба SOM в IT.FAP.Management на сумму DodoBrands из CSV.
UPDATE public.initiative_budget_department_2026 b
SET q1 = b.q1 - 137237,
    q2 = b.q2 - 136598,
    q3 = b.q3 - 129540,
    q4 = b.q4 - 133038,
    updated_at = timezone('utc'::text, now())
WHERE b.initiative_id = '2e698528-3369-45c3-b4cb-7f4b8f31b013'
  AND b.budget_department = 'IT.FAP.Management';

-- 1.2) Создаём строку у DodoBrands.io в IT.FAP.Management.
INSERT INTO public.initiative_budget_department_2026 (
  initiative_id, budget_department, q1, q2, q3, q4, is_in_pnl_it, created_at, updated_at
) VALUES (
  '0dd9bd4c-6f66-4d55-ad1d-12d65062383c',
  'IT.FAP.Management',
  137237, 136598, 129540, 133038,
  true,
  timezone('utc'::text, now()),
  timezone('utc'::text, now())
)
ON CONFLICT (initiative_id, budget_department) DO UPDATE SET
  q1 = public.initiative_budget_department_2026.q1 + EXCLUDED.q1,
  q2 = public.initiative_budget_department_2026.q2 + EXCLUDED.q2,
  q3 = public.initiative_budget_department_2026.q3 + EXCLUDED.q3,
  q4 = public.initiative_budget_department_2026.q4 + EXCLUDED.q4,
  updated_at = timezone('utc'::text, now());

-- 1.3) Пересинхронизируем quarterly_data.cost у обеих инициатив.
UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q1, 0)::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q2, 0)::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q3, 0)::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('cost', coalesce(s.q4, 0)::numeric)
         ),
    updated_at = timezone('utc'::text, now())
FROM (
  SELECT initiative_id,
         sum(q1) AS q1, sum(q2) AS q2, sum(q3) AS q3, sum(q4) AS q4
  FROM public.initiative_budget_department_2026
  WHERE initiative_id IN ('0dd9bd4c-6f66-4d55-ad1d-12d65062383c','2e698528-3369-45c3-b4cb-7f4b8f31b013')
  GROUP BY initiative_id
) s
WHERE i.id = s.initiative_id;

-- =====================================================================
-- 2) Установка effortCoefficient у 27 совпавших инициатив
-- =====================================================================

DROP TABLE IF EXISTS _tmp_fap_coef;
CREATE TEMP TABLE _tmp_fap_coef (id uuid PRIMARY KEY, q1 int, q2 int, q3 int, q4 int) ON COMMIT DROP;

-- (initiative_id, q1, q2, q3, q4)
INSERT INTO _tmp_fap_coef (id, q1, q2, q3, q4) VALUES
  -- Drum&Base (3)
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='База знаний - Гибкость и обновление всех подходов/продуктов (базовый функционал)' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 25, 25, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='База знаний - Новая база знаний' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 50, 50, 50, 50),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='База Знаний - Расширение возможностей для партнеров' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 25, 25, 50, 50),
  -- CustomerSupport (6 без стуба)
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Новая модель компенсаций' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 50, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Перевести интерфейс КЦ на React' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 30, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Перенос отзывов из приложения в чат' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 0, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Поддержка и доработка интеграции Pyrus' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 20, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Стопы пиццерий в КЦ' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 0, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='FAQ. в чате мобильного приложения' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 0, 0, 0, 0),
  -- Marketplace (см. fap_match.tsv) — нужно перечислить
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Partner API' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 10, 20, 20, 20),
  -- Partner Support (Support)
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Открытие стран - Ирак, Молдова, Испания' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 90, 0, 0, 0),
  -- Slippers of mimir (по совпавшим)
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Агрегаторы' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 0, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Лингвини' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 20, 10, 10, 10),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Платная упаковка для Европы' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 10, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Редизайн DodoBrands.io' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 10, 0, 0, 0),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='Создание сервися DaaS и интеграция с Wolt Drive' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 40, 30, 10, 20),
  ((SELECT id FROM public.initiatives WHERE unit='FAP' AND initiative='IMF Market Adaptation & Efficiency' AND COALESCE(is_timeline_stub,false)=false LIMIT 1), 10, 30, 30, 40);

\echo ''
\echo '── INSERTED ROWS in _tmp_fap_coef ──────────────────────────────────'
SELECT COUNT(*) AS rows_with_id FROM _tmp_fap_coef WHERE id IS NOT NULL;
SELECT COUNT(*) AS rows_with_null_id FROM _tmp_fap_coef WHERE id IS NULL;

-- Удаляем NULL-id (если какая-то инициатива не нашлась).
DELETE FROM _tmp_fap_coef WHERE id IS NULL;

UPDATE public.initiatives i
SET quarterly_data =
      coalesce(i.quarterly_data, '{}'::jsonb)
      || jsonb_build_object(
           '2026-Q1', coalesce(i.quarterly_data->'2026-Q1', '{}'::jsonb) || jsonb_build_object('effortCoefficient', t.q1::numeric),
           '2026-Q2', coalesce(i.quarterly_data->'2026-Q2', '{}'::jsonb) || jsonb_build_object('effortCoefficient', t.q2::numeric),
           '2026-Q3', coalesce(i.quarterly_data->'2026-Q3', '{}'::jsonb) || jsonb_build_object('effortCoefficient', t.q3::numeric),
           '2026-Q4', coalesce(i.quarterly_data->'2026-Q4', '{}'::jsonb) || jsonb_build_object('effortCoefficient', t.q4::numeric)
         ),
    updated_at = timezone('utc'::text, now())
FROM _tmp_fap_coef t
WHERE i.id = t.id;

\echo ''
\echo '── AFTER: Редизайн DodoBrands.io + стуб SOM ─────────────────────────'
SELECT i.unit, i.team, i.initiative, i.is_timeline_stub,
       ROUND(COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0)) AS y26
FROM public.initiatives i
WHERE i.id IN ('0dd9bd4c-6f66-4d55-ad1d-12d65062383c','2e698528-3369-45c3-b4cb-7f4b8f31b013')
ORDER BY i.is_timeline_stub DESC;

\echo ''
\echo '── AFTER: TOTAL должен быть = 2 111 435 636 ──────────────────────────'
SELECT 2111435636 AS truth, ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS split_total
FROM public.initiative_budget_department_2026 b;

\echo ''
\echo '── AFTER: примеры FAP-инициатив с обновлёнными коэффициентами ──────'
SELECT i.team, i.initiative,
       (i.quarterly_data->'2026-Q1'->>'effortCoefficient')::int AS q1,
       (i.quarterly_data->'2026-Q2'->>'effortCoefficient')::int AS q2,
       (i.quarterly_data->'2026-Q3'->>'effortCoefficient')::int AS q3,
       (i.quarterly_data->'2026-Q4'->>'effortCoefficient')::int AS q4
FROM public.initiatives i
JOIN _tmp_fap_coef t ON t.id = i.id
ORDER BY i.team, i.initiative;

ROLLBACK;
