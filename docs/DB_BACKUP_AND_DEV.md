# База: бэкапы, дев-окружение и безопасные правки

Документ-runbook. Цель — никогда больше не терять данные при правке прода и иметь куда откатиться, если что-то сломалось.

## TL;DR

1. Положи в `.env.local` два секрета (см. раздел «Секреты»).
2. Запусти `npm run db:backup` — появится первый снапшот в `backups/`.
3. Установи launchd-плист — он будет делать бэкап каждые 6 часов.
4. Добавь те же секреты в GitHub → Actions secrets — это страховка раз в сутки.
5. Поставь Docker Desktop и подними локальный Supabase для тестов.
6. Когда что-то ломается на проде — `npm run db:restore-preview` поднимает последний бэкап в локалку.

---

## 1. Что уже готово в репозитории

| Файл | Что делает |
|---|---|
| `scripts/db-backup.mjs` | Делает три файла: schema, data, roles. Лежат в `backups/<timestamp>/`. Ротация — последние 20. |
| `scripts/db-restore-preview.mjs` | Заливает выбранный бэкап в локальный Postgres. В прод не пишет — это запрещено в самом скрипте. |
| `scripts/launchd/com.product-portfolio.db-backup.plist` | macOS-расписание: бэкап каждые 6 часов. |
| `.github/workflows/db-backup.yml` | Резервное расписание в облаке: бэкап раз в сутки + хранение 90 дней. |
| `package.json` → `db:backup`, `db:restore-preview`, `db:start`, `db:stop`, `db:reset`, `db:diff` | Команды одной строкой. |
| `.gitignore` → `backups/` | Дампы не попадают в основной репо. |
| `~/.cursor/mcp.json` → `supabase` | Подключён Supabase MCP — после прописывания токена я смогу читать схему и при необходимости править данные напрямую. |

## 2. Секреты, которые нужны (один раз)

### a) Пароль базы данных Supabase

1. Открой [Supabase Dashboard → Project Settings → Database](https://supabase.com/dashboard/project/hfhrfjzfioaqubdyswjy/settings/database).
2. Раздел **Database password** → **Reset database password** (старый, если потерян, увидеть нельзя — только сбросить).
3. Сохрани новый пароль в надёжное место.

### b) Personal Access Token для MCP

1. Открой [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).
2. Generate new token, имя «cursor-mcp», скоп — самый широкий (или ограниченный конкретным проектом, если в UI есть такая опция).
3. Сохрани токен — после закрытия модалки его нельзя будет увидеть.

### c) Положи их в `.env.local`

Создай файл `.env.local` в корне проекта (он уже игнорируется git'ом):

```bash
# Connection string без пароля. Берём session pooler — он подходит для pg_dump.
SUPABASE_DB_URL=postgresql://postgres.hfhrfjzfioaqubdyswjy@aws-1-eu-north-1.pooler.supabase.com:5432/postgres

# Пароль БД из Dashboard
SUPABASE_DB_PASSWORD=ВСТАВЬ_СЮДА

# (опционально) direct connection для pg_dumpall --roles-only
# SUPABASE_DB_DIRECT_URL=postgresql://postgres@db.hfhrfjzfioaqubdyswjy.supabase.co:5432/postgres

# Локальная база для restore-preview (заполняется после запуска `npm run db:start`)
# LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### d) Для MCP

Открой `~/.cursor/mcp.json` и в блоке `supabase.env.SUPABASE_ACCESS_TOKEN` замени `REPLACE_ME_WITH_PERSONAL_ACCESS_TOKEN` на свой токен из шага (b). Перезапусти Cursor — MCP подцепится.

### e) Для GitHub Actions

В репозитории на GitHub → Settings → Secrets and variables → Actions → New repository secret:

- `SUPABASE_DB_URL` = то же, что в `.env.local`
- `SUPABASE_DB_PASSWORD` = то же

После этого workflow `db-backup.yml` начнёт ходить раз в сутки.

## 2.1. Эталонный baseline перед первым заполнением админки

Зафиксирована «точка возврата»:

- алиас: `backups/baseline-before-first-admin-fill`
- физический снапшот: `backups/2026-05-05T17-08Z`
- подробности: `docs/BASELINE_BEFORE_FIRST_ADMIN_FILL.md`

Если в дальнейшей работе звучит «вернёмся к состоянию перед первым заполнением» —
используем именно этот baseline.

## 3. Первый ручной бэкап — проверка, что всё работает

```bash
npm run db:backup
```

Ожидаемый результат: появилась папка `backups/2026-05-04T20-30Z/` с файлами `*.schema.sql` и `*.data.sql`. В `backups/.log` — JSON-строка с результатом. Если что-то упало — лог покажет, на каком шаге.

## 4. Расписание на маке (launchd, каждые 6 часов)

```bash
cp scripts/launchd/com.product-portfolio.db-backup.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.product-portfolio.db-backup.plist
launchctl enable gui/$(id -u)/com.product-portfolio.db-backup
launchctl kickstart -k gui/$(id -u)/com.product-portfolio.db-backup
```

Проверка статуса:
```bash
launchctl print gui/$(id -u)/com.product-portfolio.db-backup | head -30
tail -f /tmp/db-backup.stdout.log /tmp/db-backup.stderr.log
```

Снять с автозапуска:
```bash
launchctl bootout gui/$(id -u)/com.product-portfolio.db-backup
```

Важно: путь к node в плисте захардкожен под текущую nvm-версию (`v24.15.0`). Если обновляешь node — поправь `ProgramArguments` в плисте.

## 5. Локальный Supabase (дев-база)

### Установка Docker

Docker Desktop пока не установлен. Поставить можно так:
```bash
brew install --cask docker
open -a Docker      # запустить, дождаться, пока в трее появится зелёный значок
```

### Поднять стек

```bash
npm run db:start    # = supabase start, тянет образы и поднимает Postgres + Auth + Studio + ...
```

В выводе будут URL'ы и ключи. Добавь в `.env.local`:
```bash
LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Залить последний прод-снапшот в локалку

```bash
npm run db:restore-preview          # последний бэкап
# или
npm run db:restore-preview -- 2026-05-04T20-30Z
```

Скрипт защищён от случайной заливки в прод: он проверяет `LOCAL_DB_URL` и кричит, если там видит хост Supabase.

### Пересобрать локалку с нуля по миграциям

```bash
npm run db:reset    # дропает локальную базу и накатывает все миграции из supabase/migrations/
```

Это лучший способ убедиться, что миграции в принципе работают на чистой базе — частая причина продовых поломок.

## 6. Как тестировать админ-операции перед открытием доступа

1. **Локалка с реальными данными**: `npm run db:start` + `npm run db:restore-preview`. Запускаешь `npm run dev`, в `.env.local` переключаешь `VITE_SUPABASE_URL` на локальный (он печатается в выводе `supabase start`). Гоняешь админку как обычный юзер — ничего на проде не трогаешь.
2. **MCP read-only от меня**: я могу проверять данные SQL'ом и проверять последствия твоих операций, не трогая базу. Сейчас MCP настроен в полном доступе — для безопасности, если хочешь, можем добавить `--read-only` к args в `~/.cursor/mcp.json`.
3. **Playwright e2e**: уже стоит в `devDependencies`. Можно описать сценарии для самых опасных админ-операций (массовая правка, импорт CSV, удаление инициатив) и гонять их на локалке перед каждым релизом. Если скажешь — напишу базовый набор.

## 7. Дисциплина при ручных SQL в проде

Это не «бэкап», это «не ломаться». Правила:

- Любой массовый SQL в `scripts/sql/` сначала запускаешь обёрнутым в `BEGIN; ... ROLLBACK;` и смотришь `RETURNING *` или `SELECT count(*)`. Только потом меняешь `ROLLBACK` на `COMMIT`.
- Перед запуском скрипта, который меняет >100 строк — внеплановый `npm run db:backup`.
- Изменения схемы (DROP COLUMN, ALTER TYPE, переименования) — только через миграции, отдельным PR от фич.
- Soft delete (`deleted_at`) везде, где это применимо. Сейчас этого ещё нет — добавим точечно при проектировании админки.

## 8. Чего сейчас не сделано (осознанно)

- **PITR (point-in-time recovery)** — это фича Supabase Pro ($25/мес). Если нужен «откат на любую секунду в пределах 7 дней», без апгрейда не получится. Текущий план (раз в 6 ч + дневной артефакт) даёт «откат в пределах последних 6 часов» — это компромисс с free tier'ом.
- **Audit log триггеры** на ключевых таблицах (`initiatives`, `initiative_budget_department_2026`, `team_quarter_snapshots`). Полезно, чтобы быстро отвечать на «что я сейчас сломал». Делается отдельной миграцией — могу подготовить, если хочешь.
- **Анонимизация** при заливке прод-дампа в локалку. Если в данных есть чувствительные имена/email — нужен скрипт `scripts/sanitize-dump.mjs`. Тоже могу написать, когда будет понятно, что считать чувствительным.
