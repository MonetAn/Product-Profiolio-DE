# Распределение стоимости по странам и кластерам (админка)

## Данные

- Справочник стран: таблица `market_countries` (Supabase), экран **«Рынки»** (`/admin/markets`) между «Люди» и «Доступ». Поля: `cluster_key`, `label_ru`, `sort_order`, `is_active`.
- В `initiatives.quarterly_data[quarter]` хранится необязательный объект:

```json
"geoCostSplit": {
  "entries": [
    { "kind": "country", "countryId": "<uuid>", "percent": 40 },
    { "kind": "country", "countryId": "<uuid строки Drinkit в market_countries>", "percent": 60 }
  ]
}
```

- Для квартала с **нулевой** `cost` сплит не задаётся (шаг и UI пропускают ввод).
- Проценты — **целые**, для ненулевой стоимости ожидается сумма **100%** (валидация не блокирует переход в quick flow).
- **Drinkit** — отдельная строка в `market_countries` (кластер `Drinkit`, одна «страна» без подстран пока). В JSON по-прежнему допустим устаревший вариант `kind: "cluster", "clusterKey": "Drinkit"` — редактор подставляет id строки справочника при сохранении.
- Рубли по строкам: `rubleAmountsForGeoSplit(cost, entries)` в [`adminDataManager.ts`](../src/lib/adminDataManager.ts) — целые рубли, сумма по строкам = `round(cost)`.

## Стейкхолдеры

При сохранении сплита из карточки инициативы или из черновика quick flow список `stakeholders_list` **пересчитывается** по кластерам из выбранных строк справочника (`stakeholdersListFromGeoSplit`; для старых данных — и по `kind: "cluster"`). Константа `STAKEHOLDERS_LIST` в коде (в т.ч. **Other Countries**, без **IT**).

## Quick flow

После шага «Заполнение таймлайна» добавлен шаг **«Распределение по странам»**.

## Экспорт CSV

Отдельный файл **Geo split** (меню настроек на экране заполнения):

- Колонки: `Unit`, `Team`, `Initiative`, `Quarter`, `Cluster`, `Country_or_ClusterOnly`, `Percent`, `AmountRub`.
- Только строки, где есть `geoCostSplit` и `cost > 0` по кварталу из текущего набора колонок экспорта.

Импорт CSV **не** заполняет geo split.

## Дашборд

Срезы по новым данным на публичном дашборде в этой версии **не** подключены.
