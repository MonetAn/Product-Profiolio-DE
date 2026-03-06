# Отладка таймаутов Supabase на проде (debug/supabase-prod-timeout)

## Что сделано в ветке

- В **production** при первой загрузке приложения выполняется один тестовый `GET` на `https://<project>.supabase.co/rest/v1/` с таймаутом 25 с.
- В консоль браузера пишется лог **`[Supabase PROD diagnostic]`** с полями:
  - `mode` — режим сборки (production)
  - `url` — замаскированный URL проекта
  - при успехе: `status`, `elapsedMs`
  - при ошибке: `error`, `elapsedMs`, `timedOut: true` если сработал таймаут

## Как пользоваться

1. Задеплойте эту ветку на GitHub Pages (или откройте preview).
2. Откройте прод-сайт, откройте DevTools → Console.
3. Найдите лог `[Supabase PROD diagnostic]` и сохраните его (скрин или копия объекта).
4. Если `timedOut: true` и `elapsedMs` ≈ 25000 — запрос до Supabase не успевает за 25 с (сеть/маршрут/блокировка).
5. Если `status: 200` и `elapsedMs` большое (например 20+ с) — запрос доходит, но очень медленно (регион/нагрузка).

## Что проверить в Supabase Dashboard

- **Project Settings → API**: в разделе CORS / Allowed origins добавлен ли origin прода, например:
  - `https://monetan.github.io`
  - при необходимости с путём: `https://monetan.github.io/Product-Profiolio-DE`
- Проект не в паузе (на бесплатном тарифе при неактивности проект уходит в паузу — кнопка Restore).

## После выяснения причины

- Удалить блок кода с комментарием `// DEBUG: Prod-only one-time connectivity check` из `src/integrations/supabase/client.ts`.
- Смержить фикс в main или закрыть ветку.
