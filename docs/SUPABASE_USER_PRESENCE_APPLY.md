# Как применить миграцию «присутствие вместо activity_events»

Та же логика, что в файле репозитория  
[`supabase/migrations/20260412120000_user_presence_replace_activity.sql`](../supabase/migrations/20260412120000_user_presence_replace_activity.sql).

## Вариант A — Supabase CLI (если проект уже связан)

Из корня репозитория:

```bash
supabase db push
```

(или `npx supabase db push`)

## Вариант B — SQL Editor в Dashboard

1. Откройте проект в [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor** → **New query**.
2. Скопируйте **весь** текст из файла  
   `supabase/migrations/20260412120000_user_presence_replace_activity.sql`  
   и выполните **одним запуском** (Run).

**Важно:** скрипт удаляет таблицу `activity_events` и старые функции (`get_activity_summary`, `get_activity_sessions`, …). Исторические события кликов/пульсов будут потеряны — это ожидаемо.

## После применения

- Перезагрузите фронтенд: запись идёт через RPC `record_presence` (`portfolio` на главной, `admin` при входе в админку).
- Экран **Админка → Присутствие** читает `get_presence_timeline` и `get_user_presence_stats`.

## Дни и часовой пояс

День считается по **UTC** (как в SQL: `(timezone('utc', now()))::date`). В таблице на экране это подписано.

## Если какая-то `DROP FUNCTION` падает

Значит на проде другая сигнатура старой функции. Откройте в SQL Editor:

```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE '%activity%';
```

Пришлите вывод — под него можно скорректировать `DROP FUNCTION` в начале миграции.
