-- =============================================================================
-- Вариант A (из истории чата): безопасный импорт из public.stg_budget_2026_raw
-- в initiatives.quarterly_data (2026) + public.initiative_budget_department_2026.
--
-- Условия перед запуском:
--   1) Таблица stg_budget_2026_raw заполнена (импорт CSV с колонками
--      initiative, budget_department, q1_raw..q4_raw, in_pnl_it — как в budget_2026_for_supabase.csv).
--   2) initiative_budget_department_2026 существует (см. миграцию 20260504180000_...).
--
-- Делает:
--   - budget_import_2026_exceptions (логи AMBIGUOUS / MISSING_IN_DB / MISSING_IN_CSV);
--   - удаляет ключи 2025-Q* из quarterly_data у всех;
--   - для инициатив с ровно одной строкой в initiatives: пишет суммы 2026 и разбивку по департаментам;
--   - для однозначных, которых нет в CSV, обнуляет cost 2026-Q*;
--   - не трогает неоднозначные имена (несколько HR-строк с одним initiative).
--
-- Выполняйте целиком в SQL Editor внутри транзакции (begin уже внизу).
-- =============================================================================

begin;

drop table if exists public.budget_import_2026_exceptions;
create table public.budget_import_2026_exceptions (
  reason text not null,
  initiative text,
  details jsonb,
  created_at timestamptz not null default now()
);

create temporary table _stg_norm as
select
  trim(initiative) as initiative,
  trim(budget_department) as budget_department,
  coalesce(nullif(replace(replace(q1_raw, chr(160), ''), ' ', ''), ''), '0')::numeric as q1,
  coalesce(nullif(replace(replace(q2_raw, chr(160), ''), ' ', ''), ''), '0')::numeric as q2,
  coalesce(nullif(replace(replace(q3_raw, chr(160), ''), ' ', ''), ''), '0')::numeric as q3,
  coalesce(nullif(replace(replace(q4_raw, chr(160), ''), ' ', ''), ''), '0')::numeric as q4,
  case
    when upper(trim(coalesce(in_pnl_it, ''))) in ('TRUE', '1', 'ДА', 'YES') then true
    when upper(trim(coalesce(in_pnl_it, ''))) in ('FALSE', '0', 'НЕТ', 'NO') then false
    else true
  end as is_in_pnl_it
from public.stg_budget_2026_raw
where trim(coalesce(initiative, '')) <> '';

create temporary table _stg_agg as
select initiative, sum(q1) as q1, sum(q2) as q2, sum(q3) as q3, sum(q4) as q4
from _stg_norm
group by initiative;

create temporary table _db_single as
select (array_agg(id order by id))[1] as id, trim(initiative) as initiative
from public.initiatives
where coalesce(is_timeline_stub, false) = false
group by trim(initiative)
having count(*) = 1;

create temporary table _db_ambiguous as
select
  trim(initiative) as initiative,
  jsonb_agg(
    jsonb_build_object('id', id, 'unit', unit, 'team', team)
    order by unit, team, id
  ) as variants
from public.initiatives
where coalesce(is_timeline_stub, false) = false
group by trim(initiative)
having count(*) > 1;

do $$
declare
  v_rows int;
  v_matched int;
begin
  select count(*) into v_rows from _stg_norm;
  if v_rows < 1000 then
    raise exception 'staging слишком маленький (% строк) — проверьте импорт в stg_budget_2026_raw', v_rows;
  end if;

  select count(*) into v_matched
  from _stg_agg s
  join _db_single d using (initiative);

  if v_matched < 200 then
    raise exception 'слишком мало однозначных матчей (%). Проверьте нормализацию имён initiative.', v_matched;
  end if;
end $$;

insert into public.budget_import_2026_exceptions(reason, initiative, details)
select 'AMBIGUOUS_IN_DB', a.initiative, jsonb_build_object('db_variants', a.variants)
from _db_ambiguous a;

insert into public.budget_import_2026_exceptions(reason, initiative, details)
select 'MISSING_IN_DB', s.initiative, '{}'::jsonb
from (select distinct initiative from _stg_norm) s
left join (
  select distinct trim(initiative) as initiative from public.initiatives where coalesce(is_timeline_stub, false) = false
) i using (initiative)
where i.initiative is null;

insert into public.budget_import_2026_exceptions(reason, initiative, details)
select 'MISSING_IN_CSV', i.initiative, '{}'::jsonb
from (select distinct trim(initiative) as initiative from public.initiatives where coalesce(is_timeline_stub, false) = false) i
left join (select distinct initiative from _stg_norm) s using (initiative)
where s.initiative is null;

-- Удалить 2025 у всех не-stub
update public.initiatives
set
  quarterly_data =
    (coalesce(quarterly_data, '{}'::jsonb) - '2025-Q1' - '2025-Q2' - '2025-Q3' - '2025-Q4'),
  updated_at = timezone('utc'::text, now())
where coalesce(is_timeline_stub, false) = false;

-- Однозначные, нет в CSV => обнулить cost 2026
update public.initiatives i
set
  quarterly_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,cost}', to_jsonb(0::numeric), true),
          '{2026-Q2,cost}', to_jsonb(0::numeric), true
        ),
        '{2026-Q3,cost}', to_jsonb(0::numeric), true
      ),
      '{2026-Q4,cost}', to_jsonb(0::numeric), true
    ),
  updated_at = timezone('utc'::text, now())
from _db_single d
left join _stg_agg s using (initiative)
where i.id = d.id
  and s.initiative is null;

-- Однозначные + есть в CSV => сумма по инициативе в quarterly_data
update public.initiatives i
set
  quarterly_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(i.quarterly_data, '{}'::jsonb), '{2026-Q1,cost}', to_jsonb(s.q1), true),
          '{2026-Q2,cost}', to_jsonb(s.q2), true
        ),
        '{2026-Q3,cost}', to_jsonb(s.q3), true
      ),
      '{2026-Q4,cost}', to_jsonb(s.q4), true
    ),
  updated_at = timezone('utc'::text, now())
from _db_single d
join _stg_agg s using (initiative)
where i.id = d.id;

-- Разбивка по бюджетным подразделениям
delete from public.initiative_budget_department_2026
where initiative_id in (select id from _db_single);

insert into public.initiative_budget_department_2026 (
  initiative_id,
  budget_department,
  q1,
  q2,
  q3,
  q4,
  is_in_pnl_it,
  updated_at
)
select
  d.id,
  n.budget_department,
  sum(n.q1),
  sum(n.q2),
  sum(n.q3),
  sum(n.q4),
  bool_or(n.is_in_pnl_it),
  timezone('utc'::text, now())
from _stg_norm n
join _db_single d using (initiative)
group by d.id, n.budget_department
on conflict (initiative_id, budget_department) do update set
  q1 = excluded.q1,
  q2 = excluded.q2,
  q3 = excluded.q3,
  q4 = excluded.q4,
  is_in_pnl_it = excluded.is_in_pnl_it,
  updated_at = excluded.updated_at;

commit;
