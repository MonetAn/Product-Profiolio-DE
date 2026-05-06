# Runbook: открытие доступа всем

Короткий справочник: куда смотреть, если что-то пошло не так после открытия доступа.

## Что защищает базу прямо сейчас

## Базовая точка возврата

Зафиксирован baseline «перед первым заполнением админки»:

- `backups/baseline-before-first-admin-fill` → `backups/2026-05-05T17-08Z`
- карточка baseline: `docs/BASELINE_BEFORE_FIRST_ADMIN_FILL.md`

При критической поломке сначала сравнивай с этим baseline, потом принимай решение
о точечном или полном откате.

| Механизм | Что делает | Где смотреть |
|---|---|---|
| Бэкапы каждые 6 часов | Полный snapshot БД, ротация на 20 шт | `backups/` |
| Бэкапы каждый час (24ч после открытия) | То же, частота × 6 | `backups/`, в логе помечено |
| Audit log | Запись каждого INSERT/UPDATE/DELETE на 4 таблицах | `public.db_audit_log` |
| Soft delete | «Удаление» инициатив и людей теперь обратимо | колонка `deleted_at` |
| RLS «прячет deleted» | Soft-deleted строки не видны не-super_admin | RESTRICTIVE policy |

## Если кто-то что-то сломал — пошагово

### 1. «Не понимаю, кто и что менял»

```sql
-- Последние 50 изменений по всем 4 таблицам
SELECT changed_at, op, source_table, changed_by_email, row_pk, diff
FROM public.db_audit_log
ORDER BY changed_at DESC
LIMIT 50;
```

```sql
-- Что менял конкретный человек за последние 6 часов
SELECT changed_at, op, source_table, row_pk, diff
FROM public.db_audit_log
WHERE changed_by_email = 'username@dodopizza.com'
  AND changed_at > now() - interval '6 hours'
ORDER BY changed_at DESC;
```

```sql
-- Все изменения одной инициативы за сутки
SELECT changed_at, op, changed_by_email, diff
FROM public.db_audit_log
WHERE source_table = 'public.initiatives'
  AND row_pk->>'id' = '<uuid инициативы>'
  AND changed_at > now() - interval '24 hours'
ORDER BY changed_at DESC;
```

### 2. «Кто-то удалил инициативу/человека»

Hard delete через UI больше не происходит — теперь это soft delete. Восстановление:

```sql
-- Посмотреть всё, что удалено за последние сутки
SELECT id, initiative, unit, team, deleted_at
FROM public.initiatives
WHERE deleted_at > now() - interval '24 hours'
ORDER BY deleted_at DESC;

-- Восстановить
UPDATE public.initiatives SET deleted_at = NULL WHERE id = '<uuid>';
-- или через функцию (та же самая, но проверяет super_admin):
SELECT public.restore_soft_deleted('initiatives', '<uuid>');
```

То же для `people`.

### 3. «Кто-то поменял поле, нужно вернуть старое значение»

Audit log в лёгком режиме хранит `diff` (только изменённые поля, где есть `old/new`). Можно восстановить точечно:

```sql
-- Найти UPDATE, который тебя интересует
SELECT id, changed_at, changed_by_email, diff
FROM public.db_audit_log
WHERE source_table='public.initiatives'
  AND row_pk->>'id'='<uuid>'
  AND op='UPDATE'
ORDER BY changed_at DESC LIMIT 10;

-- Откатить конкретное поле к старому значению (пример: вернуть unit)
UPDATE public.initiatives
   SET unit = (SELECT diff->'unit'->>'old' FROM public.db_audit_log WHERE id = <audit_id>)
 WHERE id = '<uuid>';
```

### 4. «Всё совсем плохо, надо откатываться целиком»

Бэкапы лежат в `backups/<timestamp>/`. Последний — `backups/latest/`.

```bash
ls -lat backups/                  # увидеть все доступные снапшоты
cat backups/.log | tail -20       # посмотреть, какие были успешны
```

Полное восстановление в **локальную** базу для просмотра:
```bash
npm run db:restore-preview                  # последний
npm run db:restore-preview -- 2026-05-05T07-30Z   # конкретный
```

В прод **не лей бэкап целиком** — лучше через audit log точечно откатить только проблемные строки. Полное восстановление прод-базы из дампа — это «всё, что было правильного за последние N часов, тоже потеряется». Делать только в крайнем случае и через Supabase Dashboard, не локально.

## Когда снять усиленный режим

Через 1-2 суток после открытия доступа, когда станет понятно, что массовых поломок нет:

```bash
# Снять часовые бэкапы (вернуться только к 6-часовым)
launchctl bootout gui/$(id -u)/com.product-portfolio.db-backup-hourly
rm ~/Library/LaunchAgents/com.product-portfolio.db-backup-hourly.plist
```

Audit log и soft delete — оставлять навсегда, это не временные.

## Что НЕ ломалось при открытии доступа

- **Hard DELETE через psql/SQL Editor** для super_admin продолжает работать. Просто из UI его больше нет.
- **Existing RLS** про `current_user_has_access()` и `user_can_see_row_with_sensitive` не тронут. Soft-delete фильтр добавлен ПОВЕРХ через RESTRICTIVE policy.
- **CASCADE** на FK работает только при hard DELETE. После soft delete связные записи (assignments, budget) остаются — это правильно: при восстановлении инициативы/человека всё снова на месте.

## Если что-то сломалось в самой защите

| Симптом | Где смотреть |
|---|---|
| Бэкап упал | `backups/.log`, `/tmp/db-backup.stderr.log`, `/tmp/db-backup-hourly.stderr.log` |
| Триггер audit_log не сработал | `SELECT * FROM pg_trigger WHERE tgname LIKE '%audit_trg';` |
| Юзер видит soft-deleted | проверить `public.is_super_admin()` для его email |
| RESTRICTIVE policy отвалилась | `SELECT * FROM pg_policy WHERE polname LIKE 'hide_soft_deleted%';` |
