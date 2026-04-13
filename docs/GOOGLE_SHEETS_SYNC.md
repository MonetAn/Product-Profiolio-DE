# Синхронизация с Google Sheets (Supabase Edge Functions)

**Пошаговый план устранения ошибок и про «долгий чат» в Cursor:** см. **`docs/GOOGLE_SHEETS_FIX_PLAN.md`**.

## Что уже должно быть настроено

1. **Google Cloud:** включён **Google Sheets API**, есть сервисный аккаунт и JSON-ключ.
2. **Таблица:** расшарена на email сервисного аккаунта (`client_email` из JSON) с правом **Редактор**.
3. **Supabase → Edge Functions → Secrets:**
   - `GOOGLE_SERVICE_ACCOUNT_KEY` — полный JSON ключа одной строкой (см. ниже «Как правильно вставить ключ»).
   - `GOOGLE_SHEETS_SPREADSHEET_ID` — **только** ID из сегмента URL `/d/ИД/…` (длинная строка вроде `1vlSvfrO3ERyUD_…`). **Не** число из `#gid=74480227` — это id **вкладки**, не файла. Можно вставить и полный URL таблицы — функция вытащит ID сама (после деплоя с `spreadsheet-id.ts`).
4. **Задеплоены функции** (см. ниже).

### Ошибка `GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON`

Функция делает `JSON.parse` по **всему** значению секрета. Если парсинг падает — в интерфейсе будет этот текст.

**Типичные причины:**

| Что сделали | Почему ломается |
|-------------|-----------------|
| Вставили не весь файл | Обрезанный текст — не валидный JSON |
| Вставили многострочный JSON «как в файле» в поле, где переносы исказились | Строка перестала быть валидным JSON |
| Обрамление в кавычки (`"{ ... }"`) или лишний текст до/после | `JSON.parse` не съедает внешние кавычки целиком |
| Копипаст из Word / PDF / почты | «Кривые» кавычки, невидимые символы |
| Вместо JSON вставили только `private_key` или email | Нужен **целый** объект как в скачанном ключе |

**Как сделать правильно (рекомендуется):**

1. В Google Cloud → IAM → сервисный аккаунт → **Keys** → скачай JSON (если ключа нет — создай новый).
2. В терминале сожми в **одну строку** без переносов (macOS/Linux):

   ```bash
   jq -c . /path/to/your-service-account.json
   ```

   Скопируй **весь** вывод одной строкой (начинается с `{`, заканчивается `}`).

3. В Supabase: **Edge Functions → Secrets** → для `GOOGLE_SERVICE_ACCOUNT_KEY` **удали** старое значение и вставь **только** эту одну строку → **Save**.

4. Подожди ~1 минуту и снова нажми **«Выгрузить в лист»**.

Без `jq`: открой JSON в редакторе, убери все переносы строк внутри значения так, чтобы файл остался валидным JSON, или используй любой «JSON minify» онлайн **локально** (не вставляй ключ на сомнительные сайты).

**Проверка:** в корректном JSON есть поля `client_email`, `private_key`, `type` (часто `"service_account"`).

Переменные `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` в Edge Functions подставляются Supabase автоматически — вручную не добавляй (и **не подменяй** их в Secrets чужими значениями).

### HTTP 401 на `…/functions/v1/sheets-export-initiatives` (Invalid JWT)

Если во фронте в `.env` стоит **новый** ключ вида `sb_publishable_…`, а при деплое функций **не** применён `supabase/config.toml` из репозитория, шлюз Supabase может отвечать **401** до выполнения кода функции.

В этом проекте для Sheets-функций в `supabase/config.toml` задано `verify_jwt = false`; проверка пользователя делается внутри функции (`requireAdmin` + RPC `get_my_access`). **Обязательно деплой через CLI** из папки проекта, чтобы подтянулась конфигурация:

```bash
supabase functions deploy sheets-export-initiatives
supabase functions deploy sheets-import-from-sheet
supabase functions deploy sheets-push-in
supabase functions deploy sheets-pull-out
```

Альтернатива без смены конфига: во фронте использовать **legacy anon** JWT из Dashboard → Settings → API → **Legacy API keys** (если ещё доступны).

## Деплой функций

Нужны [Supabase CLI](https://supabase.com/docs/guides/cli) и один раз **`supabase link`** на проект.

### Где взять `project-ref` (не подставляй буквально «ВОТ_REF»)

В [Supabase Dashboard](https://supabase.com/dashboard) открой свой проект и посмотри **URL в адресной строке**:

`https://supabase.com/dashboard/project/hfhrfjzfioaqubdyswjy/...`

Здесь **`hfhrfjzfioaqubdyswjy`** — это и есть ref (20 латинских букв). У тебя может быть **другой** набор символов — копируй **свой** из URL.

```bash
cd "/Applications/Продуктовый портфель проект/product-porfolio-de-bb9a42f8-main"
supabase login          # один раз, через браузер
supabase link --project-ref hfhrfjzfioaqubdyswjy   # подставь СВОЙ ref из URL
supabase functions deploy sheets-export-initiatives
supabase functions deploy sheets-import-from-sheet
supabase functions deploy sheets-push-in
supabase functions deploy sheets-pull-out
```

Листы **IN / OUT** (коэффициенты по людям и итоги из таблицы): **`docs/GOOGLE_SHEETS_IN_OUT.md`**.

Если при `login` был таймаут — можно ввести код ещё раз; в логе у тебя со второй попытки всё прошло («Token … created successfully»).

### Частые ошибки терминала

| Сообщение | Что значит |
|-----------|------------|
| `cd: no such file or directory: .../Documents/...` | Проект лежит не в `Documents`, а там, куда ты его склонировал (у тебя — `Applications/Продуктовый портфель проект/...`). |
| `Could not read package.json` в домашней папке `~` | Сначала `cd` в папку проекта, потом `npm run dev`. |
| `Invalid project ref format` при `ВОТ_REF` | В команду подставили **заглушку из инструкции**. Нужен **реальный** ref из URL Dashboard (см. выше). |

## Вкладки в Google Таблице

Имена по умолчанию (можно переопределить секретами `SHEETS_EXPORT_TAB_NAME` и `SHEETS_IMPORT_TAB_NAME`):

### `Portfolio export` (создаётся автоматически при первой выгрузке)

После нажатия **«Выгрузить в лист»** в админке лист заполняется строками инициатив:

| id | unit | team | initiative | initiative_type | description | quarterly_data_json | updated_at |

### `Portfolio import` (создаётся автоматически при первом импорте)

Формат для ручного заполнения:

**Строка 1 (заголовки):** `id` | `coefficient` | `amount_rub`  

**Строка 2+:** UUID инициативы | коэффициент (число) | сумма в рублях (число, можно пусто)

Импорт **объединяет** данные в `initiatives.quarterly_data.sheet_sync`:

```json
{
  "coefficient": 1.5,
  "amount_rub": 100000,
  "synced_at": "2026-03-19T12:00:00.000Z"
}
```

Пустые строки и строки без `id` пропускаются.

### `IN` / `OUT` (отдельный контракт)

Кнопки **«Коэфф. → IN»** и **«Стоимость ← OUT»** в админке. Подробно: **`docs/GOOGLE_SHEETS_IN_OUT.md`**.

## UI

В разделе **Управление → инициативы** (при наличии данных) у **админов** отображается полоса **Google Sheets**: Portfolio export/import и при необходимости IN/OUT.

## Безопасность

- Вызов функций только с JWT пользователя; внутри проверяется `get_my_access().is_admin`.
- Ключ Google не хранится во фронте — только в Secrets Supabase.

## Если в админке «Failed to fetch» / «Не удалось достучаться»

1. Убедись, что нужные функции задеплоены в **тот же** проект Supabase, что в `.env` (`VITE_SUPABASE_URL`):
   ```bash
   supabase functions deploy sheets-export-initiatives
   supabase functions deploy sheets-import-from-sheet
   supabase functions deploy sheets-push-in
   supabase functions deploy sheets-pull-out
   ```
2. В браузере **F12 → Network** нажми кнопку выгрузки и открой запрос к `.../functions/v1/sheets-export-initiatives`:
   - **404** — функция не задеплоена или неверное имя.
   - **401/403** — сессия или права админа; обнови страницу, войди снова.
   - Запрос **(failed)** или **CORS** — сеть/VPN или ответ шлюза без CORS (часто тоже 404/не тот URL).
3. В Dashboard: **Edge Functions** — в списке должны быть задеплоены используемые функции (`sheets-export-initiatives`, `sheets-import-from-sheet`, при IN/OUT ещё `sheets-push-in`, `sheets-pull-out`).
