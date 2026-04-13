# Листы IN / OUT (коэффициенты и стоимость)

Контракт с Google Таблицей для цикла: **Supabase → лист IN** (коэффициенты по людям) и **лист OUT → Supabase** (итоговая стоимость по кварталам **2025 и 2026**).

## Edge Functions

| Функция | Действие |
|---------|----------|
| `sheets-push-in` | Заполняет вкладку **IN** из `person_initiative_assignments` + `people` + `initiatives`. |
| `sheets-pull-out` | Читает **OUT**: **O–R** (итоги 2025), **Y–AB** (SUM Q1–Q4 Plan за 2026) → снимок в **`sheet_out_itog_2025`** (ключи и за 2025, и за 2026) **и** обновляет **`quarterly_data["2025-Q*" / "2026-Q*"].cost`**. |

Секреты те же, что для остальных Sheets-функций: `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`.

Опционально:

- `SHEETS_IN_TAB_NAME` — по умолчанию `IN`
- `SHEETS_OUT_TAB_NAME` — по умолчанию `OUT`

## Лист IN

- **Строка 1:** заголовки `id`, `Юнит`, `Команда`, `Инициатива`, `ФИО`, затем `2025-Q1` … `2026-Q4` (колонки **A–M**).
- **Со строки 2:** данные. Колонка **A** = UUID инициативы (как в Supabase).

Источник строк — только назначения из админки «Люди»: одна строка = одна пара (человек × инициатива).

## Лист OUT

- **Строка 2:** шапка таблицы (как в боевой вёрстке: Fact, Прочие, **Итог**, лидеры, Plan …).
- **Первая строка данных:** в коде чтение с **строки 3** (`OUT_DATA_START_ROW`); если UUID инициатив начинаются с **4-й** строки, пустая 3-я строка просто пропускается парсером.
- **Колонка A:** UUID инициативы.
- **Колонки O–R:** **O = итог 2025-Q1** … **R = 2025-Q4**.
- **Колонки Y–AB:** **Y…AB = SUM из Q1–Q4 Plan за 2026** (соответствие **2026-Q1 … 2026-Q4**).

Если смещение «Итог» 2025 не с **O**, поправьте `OUT_COL_ITOG_Q1` / `OUT_COL_ITOG_Q4` в `supabase/functions/_shared/sheets-in-out-layout.ts`. Для 2026 — `OUT_COL_2026_ITOG_Q1` / `OUT_COL_2026_ITOG_Q4` (по умолчанию Y–AB).

## Где смотреть логи Edge Function

1. [Supabase Dashboard](https://supabase.com/dashboard) → ваш проект → **Edge Functions**.
2. Откройте функцию (например **`sheets-pull-out`**).
3. Вкладка **Logs** — последние вызовы, ошибки, время выполнения.

Также ответ функции виден в браузере: **F12 → Network** → запрос `…/functions/v1/sheets-pull-out` → **Response** (поля `updated`, `errors`, `message`).

## Куда пишутся итоги в БД

Дублируется в двух местах (удобно и для отладки, и для UI):

1. **`sheet_out_itog_2025`** — имя поля историческое; в объекте лежат ключи **2025-Q1…Q4** и **2026-Q1…Q4**, плюс `synced_at`.
2. **Для каждого квартала из листа** (`2025-Q1`…`2026-Q4`, если ячейка не пустая) → поле **`cost`** в соответствующем ключе `quarterly_data`. Остальные поля квартала не трогаются.

```json
"quarterly_data": {
  "2025-Q1": { "cost": 123456.78, "comment": "", ... },
  "2026-Q2": { "cost": 99999, ... },
  "sheet_out_itog_2025": {
    "2025-Q1": 123456.78,
    "2026-Q2": 99999,
    "synced_at": "2026-03-20T12:00:00.000Z"
  }
}
```

Пустые ячейки в OUT для квартала не перезаписывают ни `sheet_out_itog_2025`, ни `cost` за этот квартал (в импорт попадают только непустые числа).

## Производительность `sheets-pull-out`

Импорт делает:

1. Один запрос к Google (диапазон OUT).
2. Пакетные `select` по `initiatives` (чанки по id).
3. Батч-`update` через RPC **`apply_initiatives_quarterly_data_batch`** (чанки по 200 строк).

**Обязательно применить миграцию** (один раз на проект):

- `supabase db push` / `supabase migration up`, или SQL из  
  `supabase/migrations/20260323140000_apply_initiatives_quarterly_data_batch.sql`  
  в Dashboard → SQL Editor.

Без функции RPC Edge вернёт 500 с подсказкой в теле ответа.

## Предпросмотр без записи в БД (быстрый сценарий + API)

| Функция / режим | Назначение |
|-----------------|------------|
| `sheets-push-in` + тело `{"previewQuarterEfforts":{"<uuid>":{"2025-Q3":25}}}` | Записать лист **IN**, подмешав коэффициенты по инициативам **поверх** данных из `person_initiative_assignments` (черновик в UI без сохранения в БД). |
| `sheets-pull-out` + тело `{ "previewOnly": true }` | Прочитать **OUT** (O–R и Y–AB) и вернуть **`preview`** **без** записи в Postgres. |
| `sheets-preview-calculation` | Один вызов: глобальная блокировка → push IN (с `previewQuarterEfforts`) → опрос OUT до стабилизации значений → ответ с `preview`; блокировка снимается в `finally`. |

**Миграция блокировки** (один раз): `supabase/migrations/20260314120000_sheet_preview_lock.sql` (таблица `sheet_preview_lock` + RPC `acquire_sheet_preview_lock` / `release_sheet_preview_lock`, только `service_role`).

### Вариант 1 vs 2 (сохранять в БД до расчёта или оверрайды)

- **Вариант 1** (сначала «Сохранить в базу»): после сохранения коэффициенты в БД и на листе IN совпадают; откат только листа — снова `push-in` без тела. Если пользователь **не** сохранял черновик, в БД остаются старые коэффициенты — это нормально; превью без оверрайдов покажет расчёт по **старой** БД, а не по полям в форме.
- **Вариант 2** (`previewQuarterEfforts` в теле): превью соответствует тому, что видит пользователь в UI, **без** записи в `initiatives` / assignments до явного «Сохранить». Риски: чуть больше кода и контракта API; нужно не забывать восстанавливать IN из базы, если расчёт не принят.

В проекте в быстром сценарии используется **вариант 2** на шаге «Предварительный расчёт».

**UI:** кнопка и поясняющий блок на шаге проверки сейчас **скрыты** (`SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION` в `AdminQuickFlow.tsx`). См. [`docs/ADMIN_QUICK_FLOW_GOOGLE_SHEETS_PREVIEW.md`](ADMIN_QUICK_FLOW_GOOGLE_SHEETS_PREVIEW.md).

## Деплой

```bash
supabase functions deploy sheets-push-in
supabase functions deploy sheets-pull-out
supabase functions deploy sheets-preview-calculation
```

В `supabase/config.toml` для этих функций задано `verify_jwt = false` (совместимость с ключом `sb_publishable_…`); авторизация — через `requireAdmin` внутри функции.

## Старые вкладки Portfolio export / import

Кнопки **«Выгрузить в лист»** / **«Импорт с листа»** по-прежнему работают с **Portfolio export** и **Portfolio import**. IN/OUT — отдельные кнопки в той же полосе.
