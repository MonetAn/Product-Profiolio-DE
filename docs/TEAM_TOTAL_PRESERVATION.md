# Сохранение тотала команды при операциях с инициативами

## Проблема (подтверждено на prod: App&Web / m0rder)

| Метрика | Значение |
|---------|----------|
| baseline (LIST1) | 50 050 732 ₽ |
| live (факт в БД) | 63 872 734 ₽ |
| gap | **+13 822 002 ₽** |

При **удалении** инициативы старый код пересчитывал cost по **baseline LIST1**, а не по загруженному live → тотал команды **падал на ~13.8M** к эталону.

Preview в Hub показывал сохранение тотала (frozen), БД — нет (baseline). Расхождение UI ↔ БД.

## Целевая модель

```
Tq (тотал команды за квартал) = фиксирован при любой админ-операции
Σ% не-заглушек ≤ 100%
Не-заглушки: cost = round(eff/100 × Tq)
Заглушка «Не распределено»: cost = Tq − Σ cost инициатив
```

| Операция | Поведение |
|----------|-----------|
| Удалить инициативу | Доля → стаб / остальные по %; **Tq не меняется** |
| Добавить инициативу | 0% / 0 cost; при назначении % — из стаба |
| Изменить % (Quick Flow) | Перераспределение внутри **frozen Tq** |
| Σ% > 100% | **Сохранение заблокировано** |

`team_budget_baseline_2026` — **справочник LIST1** для сверки и отдельного SQL-reconcile, **не** якорь для delete/Quick Flow.

## Изменения в коде

- `redistributeTeamCosts2026.ts`: `fixedTqByQuarter` приоритетнее baseline; delete без baseline в buildOpts
- `resolveTeamYearTarget`: годовой target из frozen, не из `rub_all`
- `buildQuarterlyDataFromPreview`: блок при Σ% > 100%

## Repro на prod (до деплоя фикса)

### 1. Зафиксировать тотал (SQL Editor)

```sql
SELECT round(sum(
  COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric, 0)
  + COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric, 0)
))::bigint AS live_year
FROM initiatives
WHERE deleted_at IS NULL AND unit = 'App&Web' AND team ILIKE '%order%';
```

Ожидаемо сейчас: **~63 872 734**

### 2. Удалить одну небольшую инициативу в админке (Hub / Quick Flow)

Не заглушку. Запомнить название.

### 3. Снова SQL из шага 1

| Версия | Ожидаемый `live_year` после delete |
|--------|--------------------------------------|
| **Баг (сейчас)** | **~50 050 732** (−13.8M к baseline) |
| **После фикса** | **~63 872 734** (без изменений) |

### 4. Откат (если repro на prod)

Восстановить из бэкапа или `budget_2026_redistribute_all_teams_by_effort.sql` — только по согласованию.

## Локальная проверка

```bash
npm test -- src/lib/teamTotalPreservation.test.ts src/lib/redistributeTeamCosts2026.test.ts
node scripts/investigate-team-total-drift.mjs "App&Web" "Site"
```

## Отдельно: разовый reconcile к LIST1

Если нужно **намеренно** подтянуть live к эталону — только явный SQL (`budget_2026_redistribute_all_teams_by_effort.sql`), не побочный эффект delete.
