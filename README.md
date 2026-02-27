# Product Portfolio (Budget Treemap Explorer)

Дашборд для просмотра портфолио инициатив по юнитам/командам: тримап бюджета, стейкхолдеры, таймлайн (Gantt). Есть админка для инициатив и людей.

---

## Стек

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Radix)
- **React Router**, **TanStack Query**, **Framer Motion**
- **Supabase** — БД и Auth (вход через Google OAuth)
- **D3** — расчёт layout тримапа

---

## Запуск

```bash
npm i
npm run dev
```

Приложение: **http://localhost:8080** (порт в `vite.config.ts`).

Другие команды: `npm run build`, `npm run preview`, `npm run lint`, `npm run test`.

---

## Структура проекта

- **`src/pages/`** — страницы: `Index` (тримап + фильтры), `Admin` (инициативы), `AdminPeople` (люди и назначения), `Auth` (вход через Google).
- **`src/components/`** — UI: `BudgetTreemap`, `StakeholdersTreemap`, `GanttView`, `FilterBar`, `Header`; папки `admin/`, `admin/people/`, `treemap/`, `ui/` (shadcn).
- **`src/hooks/`** — `useAuth`, `useInitiatives`, `usePeople`, `usePeopleAssignments`, `useTeamSnapshots`, `useCSVImport`, и др.
- **`src/lib/`** — `dataManager`, `adminDataManager`, `peopleDataManager` (работа с данными/агрегациями для тримапа и админки).
- **`src/integrations/`** — `supabase/client.ts`, `supabase/types.ts` (типы БД).
- **`.env`** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (не коммитить).

Роуты: `/` — главная (тримап), `/admin` — инициативы, `/admin/people` — люди, `/admin/access` — управление доступом (только админы), `/auth` — вход.

---

## Авторизация и доступ

- Вход через **Google** (Supabase Auth). Настройка в Supabase: Authentication → Providers → Google; Redirect URLs включают `http://localhost:8080`.
- Логика в **`src/hooks/useAuth.tsx`**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.
- Доступ только для пользователей с email **@dodobrands.io** (проверка `isDodoEmployee` в коде). Остальных редиректит на `/auth`.
- **Вайтлист и роли:** доступ к приложению даётся только пользователям из таблицы `allowed_users`. Роли: **Админ** (доступ к дашборду и разделу «Управление», в т.ч. управление доступом) и **Пользователь** (только просмотр дашборда, без кнопки «Управление»). Миграция: **`supabase-migration-access-control.sql`** — выполнить в Supabase SQL Editor после базовой схемы. После миграции вручную добавить первого админа: `INSERT INTO public.allowed_users (email, role) VALUES ('a.monetov@dodobrands.io', 'admin');`. Дальше управление доступом — в разделе Управление → Доступ.

---

## Данные (Supabase)

- Таблицы: `initiatives`, `people`, `person_initiative_assignments`, `initiative_history`, `person_assignment_history`, `profiles`, `team_quarter_snapshots`, `allowed_users` (вайтлист и роли).
- Схема и RLS: **`supabase-schema.sql`**, затем **`supabase-migration-access-control.sql`** для доступа. Подробности — **`SUPABASE_SETUP.md`**.
- Типы TypeScript для БД: **`src/integrations/supabase/types.ts`**.

---

## Тримап

- Три вкладки на главной: **Budget**, **Stakeholders**, **Timeline** (Gantt).
- Компоненты тримапа: **`TreemapContainer`**, **`TreemapNode`**, **`TreemapTooltip`**, layout в **`useTreemapLayout.ts`** (D3).
- На квадратах показывается **процент** от текущего итога по видимым нодам (не абсолютная сумма). Итог считается в `TreemapContainer` (`totalValue`), передаётся в каждый `TreemapNode`.
- Фильтры (юниты, команды, стейкхолдеры, период, чекбоксы) задают, какие ноды попадают в данные; зум по клику — через `focusedPath` внутри контейнера.

---

## Репозиторий

**GitHub:** https://github.com/MonetAn/Product-Profiolio-DE  

Ветка по умолчанию — `main`. Push по SSH (ключ в `~/.ssh/`).

---

## Для следующего чата

- Проект живой: ожидаются частые правки в UI, фильтрах, админке, тримапе.
- Важные места: страница главной и фильтры — `Index.tsx` + `FilterBar`; данные для тримапа — `dataManager` и хуки инициатив/людей; отображение ячеек тримапа — `TreemapNode.tsx` и `TreemapContainer.tsx`; админка — `Admin.tsx`, `AdminPeople.tsx` и компоненты в `admin/`.
- Локально всегда проверять через `npm run dev` и http://localhost:8080; перед коммитом — `npm run lint` при необходимости.
