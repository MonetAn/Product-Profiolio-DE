# Настройка нового проекта Supabase

Проект уже подключён к вашей новой базе (URL и ключ в `.env`). Осталось сделать в Supabase Dashboard.

## 1. Создать таблицы

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard/project/hfhrfjzfioaqubdyswjy) → **SQL Editor**.
2. Создайте новый запрос и вставьте весь код из файла **`supabase-schema.sql`**.
3. Нажмите **Run** — создадутся таблицы и политики RLS.

## 2. Включить вход через Google

1. В том же проекте: **Authentication** → **Providers** → **Google**.
2. Включите Google и укажите **Client ID** и **Client secret** из вашего Google Cloud (проект Product Portfolio или тот, что уже настраивали).
3. **Authentication** → **URL Configuration**:
   - в **Redirect URLs** добавьте: `http://localhost:8080`, `http://localhost:8080/**` и ваш прод-домен (например для GitHub Pages — `https://<user>.github.io/Product-Profiolio-DE/`);
   - при необходимости задайте **Site URL** (для прода — ваш домен приложения).

После этого запустите приложение (`npm run dev`) и проверьте вход через Google на localhost.

## Если ключ не подходит

Если в консоли браузера будет ошибка авторизации, возьмите **anon** (legacy) ключ:  
**Project Settings** → **API** → вкладка **Legacy API Keys** → скопируйте **anon** и подставьте в `.env` в `VITE_SUPABASE_PUBLISHABLE_KEY`.
