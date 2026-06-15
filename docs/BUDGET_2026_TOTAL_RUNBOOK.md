# Runbook: тотал бюджета 2026 (LIST1) и админка ↔ дашборд

Краткая инструкция для человека или агента: **если тотал на дашборде/в админке «упал» или не сходится с эталоном**.

---

## Эталон (LIST1)

| Метрика | Значение |
|---------|----------|
| Портфель, все бюджеты | **2 111 435 636 ₽** |
| Портфель, только PnL IT | **2 038 870 010 ₽** |

Таблицы в Supabase:

- `budget_portfolio_anchor_2026` — якорь портфеля (id=1)
- `team_budget_baseline_2026` — **Tq по командам** (unit, team, q1–q4, rub_all, rub_pnl_it)

---

## Один источник истины (код)

Для **2026** дашборд и админка читают **`initiatives.quarterly_data` → cost + otherCosts** (поле `budget` в UI строится из cost).

- Split `initiative_budget_department_2026` — вспомогательный; для 2026 **деньги в UI = quarterly cost**.
- Логика: `src/lib/budgetTruth2026.ts`, `src/lib/dataManager.ts` → `calculateBudget`.
- Эталон команд: `src/hooks/useBudgetTruth2026.ts`.

**После деплоя `0c8e188` (main):** при **удалении инициативы** в админке бюджет **не пропадает** — команда пересчитывается по baseline + % усилия (`src/lib/redistributeTeamCosts2026.ts`, `useInitiativeMutations` delete).

---

## Почему тотал мог разойтись

| Причина | Симптом | Что делать |
|---------|---------|------------|
| Удаление инициативы **до** деплоя fix | Портфель −N млн, «дыра» по команде | SQL redistribute (ниже) |
| Σ% усилий &lt; 100%, **нет стaba** | Cost команды &lt; rub_all | SQL redistribute (создаёт/доводит стаб) |
| Две заглушки в команде | Дубли «Не распределено», treemap врёт | `scripts/sql/merge_duplicate_team_stubs_apply.sql` |
| `rub_all` ≠ q1+q2+q3+q4 в baseline | Пыль ~тыс. ₽ на команду | Норма; финальная доводка в redistribute |
| Команда **вне** baseline | Cost «висят» или обнуляются reconcile | Проверить `team_budget_baseline_2026` |

**Redistribute-SQL не удаляет инициативы** и **не трогает** description, ссылки, % усилия (кроме обнуления effort на стабе). Меняет только **cost 2026** и split.

---

## Быстрая диагностика (Supabase SQL Editor)

Запускать **целиком**, только SELECT:

```
scripts/sql/diag_gap_2111_detail.sql
```

или короче:

```
scripts/sql/diag_gap_2111_vs_live.sql
```

Смотреть:

- `sum_live_quarterly_cost` vs **2 111 435 636**
- `gap_all_rub`
- таблица команд с `|live − baseline| > 1000`

---

## Починка данных (prod, SQL Editor)

### Шаг 1 — основной (перераспределение по % усилия)

```
scripts/sql/budget_2026_redistribute_all_teams_by_effort.sql
```

1. **Run целиком** (не выделять фрагмент). В конце пока **`ROLLBACK`**.
2. Проверить блок **`after`**:
   - `portfolio_gap` ≈ **0**
   - `teams_ok_within_1k` = `teams_in_baseline` (обычно **54 / 54**)
   - таблица **`team_gap`** — **0 строк**
3. Заменить `ROLLBACK` → **`COMMIT`**, Run снова.
4. Hard refresh дашборда (2026, «Деньги»).

**Go/no-go перед COMMIT:** `teams_ok_within_1k` = все команды; `portfolio_gap` не миллионы.

### Шаг 2 — если gap ≈ `anchor_minus_baselines`

Сумма `team_budget_baseline_2026.rub_all` меньше якоря LIST1 — effort-скрипт не добьёт до 2 111M. Тогда:

```
scripts/sql/budget_2026_reconcile_to_list1_anchor.sql
```

Preview → COMMIT. Масштабирует cost команд до rub_all (не по % усилия).

### Шаг 3 — одна команда / после удалений (пример)

```
scripts/sql/fix_purrrrfectionists_redistribute_by_effort.sql
```

Шаблон: поменять unit/team в INSERT, preview → COMMIT.

### Дубли заглушек

Preview: `scripts/sql/merge_duplicate_team_stubs.sql`  
Apply: `scripts/sql/merge_duplicate_team_stubs_apply.sql` (`dry_run := false`)

---

## Поведение приложения (после push `0c8e188`)

| Действие | БД |
|----------|-----|
| Удалить инициативу в админке | soft-delete (`deleted_at`); cost обнуляется у строки; **вся команда** → `redistributeTeamCosts2026InDb` |
| Сохранить % в Quick Flow | `buildQuarterlyDataFromPreview` → cost по Tq команды |

Локальный тест: `npm run dev` → удалить инициативу с cost → тотал портфеля **не должен упасть**.

---

## Сравнение с бэкапом — когда нужно

| Проверять | Не обязательно |
|-----------|----------------|
| description, documentation_link, effortCoefficient, имена | **cost 2026** — после reconcile **намеренно** другой |
| `count(*)` WHERE `deleted_at IS NULL` | Побайтный diff quarterly cost |
| Soft-deleted строки (должны быть только явные удаления) | |

Бэкапы: `docs/DB_BACKUP_AND_DEV.md` → `npm run db:backup`, `backups/latest/`.

Быстрый sanity в SQL Editor:

```sql
SELECT count(*) AS active_initiatives
FROM public.initiatives WHERE deleted_at IS NULL;

SELECT count(*) AS empty_description_non_stub
FROM public.initiatives
WHERE deleted_at IS NULL AND NOT is_timeline_stub
  AND coalesce(trim(description), '') = '';
```

---

## Файлы для агента (карта репозитория)

| Задача | Путь |
|--------|------|
| Runbook (этот файл) | `docs/BUDGET_2026_TOTAL_RUNBOOK.md` |
| Диагностика gap | `scripts/sql/diag_gap_2111_detail.sql` |
| Fix: % усилия + baseline | `scripts/sql/budget_2026_redistribute_all_teams_by_effort.sql` |
| Fix: масштаб до якоря | `scripts/sql/budget_2026_reconcile_to_list1_anchor.sql` |
| Delete → save total (код) | `src/lib/redistributeTeamCosts2026.ts` |
| Delete mutation | `src/hooks/useInitiativeMutations.ts` |
| Preview удаления в матрице | `src/lib/adminEffortTreemapPreviewModel.ts` → `rowsAfterSimulatedDeletes` |
| Merge дублей стaba | `scripts/sql/merge_duplicate_team_stubs_apply.sql` |
| Бэкапы | `docs/DB_BACKUP_AND_DEV.md` |

---

## Чеклист «тотал разошёлся»

```
[ ] diag_gap_2111_detail.sql — зафиксировать gap и команды-виновники
[ ] budget_2026_redistribute_all_teams_by_effort.sql — ROLLBACK, проверить after
[ ] teams_ok_within_1k = teams_in_baseline, team_gap пусто, portfolio_gap ≈ 0
[ ] COMMIT
[ ] Дашборд: 2026 Q1–Q4, «Деньги» — ~2 111.4M
[ ] При необходимости: merge_duplicate_team_stubs_apply.sql
[ ] Убедиться, что задеплоен main ≥ 0c8e188 (delete не роняет тотал)
```

---

## Частые ошибки в SQL Editor

- **Run только кусок файла** → temp-таблицы/`DO` ломаются. Всегда **весь файл**.
- **`Success. No rows`** на merge apply с `dry_run := true` — **изменений нет**.
- **`relation merge_stub_cfg does not exist`** — старый merge; использовать `merge_duplicate_team_stubs_apply.sql`.
