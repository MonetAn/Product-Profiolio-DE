# Пошаговая инструкция: хостинг проекта на GitHub Pages

Подробный алгоритм для тех, кто делает это впервые. Проект — Vite + React, деплой настроен через GitHub Actions (сборка и публикация на GitHub Pages).

---

## Часть 1. Подготовка: Git и GitHub

### Шаг 1.1. Установить Git (если ещё не установлен)

- **macOS:** откройте «Терминал» и выполните:
  ```bash
  xcode-select --install
  ```
  Или установите [Git с сайта](https://git-scm.com/download/mac).
- Проверка: в Терминале введите **только** эту строку (без трёх обратных кавычек ``` и без слова bash):
  ```
  git --version
  ```
  Должна появиться строка вида `git version 2.x.x`. Если пусто — переустановите Git.

### Шаг 1.2. Зарегистрироваться на GitHub

1. Зайдите на [github.com](https://github.com).
2. Нажмите **Sign up** и создайте аккаунт (email, пароль, имя пользователя).
3. Подтвердите email, если GitHub попросит.

### Шаг 1.3. Настроить Git на компьютере (один раз)

В Терминале выполните **по одной строке** (подставьте свои имя и email). Копируйте только строку с командой, без обратных кавычек:

```bash
git config --global user.name "Ваше Имя"
git config --global user.email "ваш-email@example.com"
```

При успехе эти команды **ничего не выводят** — это нормально. Проверить настройки можно так:
```bash
git config --global user.name
git config --global user.email
```
Должны показаться ваши имя и email. Используйте тот же email, что привязан к аккаунту GitHub.

---

## Часть 2. Создание репозитория на GitHub

### Шаг 2.1. Создать новый репозиторий

1. На GitHub нажмите **+** в правом верхнем углу → **New repository**.
2. Заполните:
   - **Repository name:** например `product-portfolio` (латиница, без пробелов). Запомните это имя — оно понадобится для настройки.
   - **Description** — по желанию.
   - Оставьте **Public**.
   - **Не** ставьте галочки «Add a README», «Add .gitignore» — проект уже есть у вас локально.
3. Нажмите **Create repository**.

### Шаг 2.2. Запомнить URL репозитория

На открывшейся странице будет что-то вроде:

- **HTTPS:** `https://github.com/ВАШ_ЛОГИН/product-portfolio.git`
- **SSH:** `git@github.com:ВАШ_ЛОГИН/product-portfolio.git`

HTTPS проще для начала. Подставьте свой логин и имя репозитория.

---

## Часть 3. Первый пуш проекта в GitHub

### Шаг 3.1. Открыть папку проекта в Терминале

```bash
cd /Users/antonmonetov/Documents/product-porfolio-de-bb9a42f8-main
```

(Или откройте эту папку в Cursor/VS Code и откройте встроенный Терминал — он уже будет в нужной папке.)

### Шаг 3.2. Инициализировать Git (если ещё не инициализирован)

Проверьте, есть ли уже Git:

```bash
git status
```

- Если видите «not a git repository» — выполните:
  ```bash
  git init
  ```
- Если `git status` показывает список файлов — репозиторий уже есть, переходите к шагу 3.3.

### Шаг 3.3. Добавить файлы и сделать первый коммит

```bash
git add .
git commit -m "Первый коммит: проект для GitHub Pages"
```

Если Git спросит про имя/email — вернитесь к шагу 1.3.

### Шаг 3.4. Подключить удалённый репозиторий и отправить код

Замените `ВАШ_ЛОГИН` и `product-portfolio` на свои:

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/product-portfolio.git
git branch -M main
git push -u origin main
```

- При первом `git push` браузер или Терминал могут попросить войти в GitHub (логин/пароль или токен). Следуйте подсказкам.
- Если просят пароль — в GitHub сейчас используются **Personal Access Tokens** вместо пароля: GitHub → Settings → Developer settings → Personal access tokens → создать токен с правом `repo` и подставить его в поле пароля.

После успешного пуша код появится на GitHub в ветке `main`.

---

## Часть 4. Настройка проекта для GitHub Pages

### Шаг 4.1. Указать правильный base в Vite

На GitHub Pages сайт из репозитория открывается по адресу:

`https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПОЗИТОРИЯ/`

Поэтому в проекте должен быть указан этот префикс.

1. Откройте файл **`vite.config.ts`** в редакторе.
2. Найдите строку с `base:` и замените на (подставьте **своё** имя репозитория):

   ```ts
   base: '/ИМЯ_РЕПОЗИТОРИЯ/',
   ```

   Пример: если репозиторий называется `product-portfolio`, то:

   ```ts
   base: '/product-portfolio/',
   ```

3. Сохраните файл.

Если имя репозитория совпадает с именем папки (`product-porfolio-de-bb9a42f8-main`), используйте его:

```ts
base: '/product-porfolio-de-bb9a42f8-main/',
```

### Шаг 4.2. Роутер (React Router)

В проекте уже используется `BrowserRouter`. Для работы с `base` в `vite.config.ts` нужно передать тот же префикс в роутер.

Откройте **`src/App.tsx`** и измените строку с `BrowserRouter` на:

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

Так маршруты (/admin, /auth и т.д.) будут работать после деплоя на GitHub Pages.

(Если в проекте уже есть `basename` — просто убедитесь, что используется `import.meta.env.BASE_URL`.)

### Шаг 4.3. Закоммитить изменения

```bash
git add vite.config.ts src/App.tsx
git commit -m "Настройка base для GitHub Pages"
git push
```

---

## Часть 5. Включить GitHub Pages и автоматический деплой

### Шаг 5.1. Убедиться, что workflow на месте

В проекте должен быть файл:

`.github/workflows/deploy-gh-pages.yml`

Он запускает сборку (npm run build) и публикует результат на GitHub Pages. Если файла нет — создайте его по примеру из раздела «Возможные проблемы».

### Шаг 5.2. Включить GitHub Pages в настройках репозитория

1. Откройте свой репозиторий на GitHub.
2. Вкладка **Settings** (Настройки).
3. Слева меню **Pages** (в блоке «Code and automation»).
4. В разделе **Build and deployment**:
   - **Source:** выберите **GitHub Actions** (деплой через workflow, а не из ветки).
   - Сохранять ничего дополнительно не нужно — источник уже выбран.

### Шаг 5.3. Запустить деплой (первый раз)

1. Убедитесь, что последние изменения запушены (в том числе файл `.github/workflows/deploy-gh-pages.yml` и настройки base/basename):
   ```bash
   git add .
   git status
   git commit -m "Добавлен workflow для GitHub Pages"
   git push
   ```
2. На GitHub откройте репозиторий → вкладка **Actions**.
3. Должна появиться задача «Deploy to GitHub Pages». Дождитесь зелёной галочки (успех).
4. Если была ошибка — откройте запуск и посмотрите лог (часто это неправильный base или ошибка сборки).

### Шаг 5.4. Открыть сайт

Через 1–2 минуты сайт будет доступен по адресу:

**https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПОЗИТОРИЯ/**

Пример: `https://johndoe.github.io/product-portfolio/`

---

## Часть 6. Дальнейшая работа

- Любой пуш в ветку **main** будет запускать workflow заново: проект соберётся и обновится на GitHub Pages.
- Изменения в **Settings → Pages** не требуются, если вы не меняете ветку/папку деплоя.

---

## Возможные проблемы

### «404» при переходе по ссылке типа /admin или при обновлении страницы

У проекта есть клиентский роутинг (React Router). В репозитории добавлен шаг копирования `index.html` в `404.html` в workflow — тогда GitHub Pages будет отдавать ваше приложение и для таких путей. Убедитесь, что в workflow после сборки есть копирование `dist/index.html` в `dist/404.html`.

### Сайт открывается, но пустая страница / не грузятся стили и скрипты

- Проверьте **base** в `vite.config.ts`: он должен быть `/ИМЯ_РЕПОЗИТОРИЯ/` (с начальным и конечным слэшем).
- Проверьте в `App.tsx` использование `basename={import.meta.env.BASE_URL}` у `BrowserRouter`.

### GitHub просит токен вместо пароля

Используйте Personal Access Token: GitHub → Settings (профиль) → Developer settings → Personal access tokens → Generate new token (classic), включите scope **repo**. Скопируйте токен и вставляйте его вместо пароля при `git push`.

### Ошибка при сборке в Actions

Откройте вкладку **Actions** → нужный запуск → лог. Частые причины: отсутствие `package-lock.json` (добавьте его в репозиторий и запушьте), ошибки в коде или в `vite.config.ts`. Исправьте по логу и сделайте новый коммит и пуш.

### В консоли браузера: «supabaseUrl is required» / пустая страница

Приложение использует Supabase; при сборке на GitHub переменные окружения из вашего локального `.env` не попадают в сборку. Нужно задать их как **секреты репозитория**:

1. Откройте репозиторий на GitHub → **Settings** → слева **Secrets and variables** → **Actions**.
2. Нажмите **New repository secret** и добавьте два секрета (значения возьмите из вашего локального файла `.env`):
   - **Name:** `VITE_SUPABASE_URL` → **Secret:** ваш Supabase URL (например `https://xxxxx.supabase.co`).
   - **Name:** `VITE_SUPABASE_PUBLISHABLE_KEY` → **Secret:** ваш Supabase anon/public key.
3. Сохраните. После следующего деплоя (пуша в `main` или ручного запуска workflow) сборка подставит эти значения, и приложение перестанет падать с «supabaseUrl is required».

---

## Краткий чек-лист

- [ ] Установлен Git, настроены имя и email.
- [ ] Есть аккаунт GitHub, создан репозиторий.
- [ ] Выполнены `git init` (если нужно), `git add .`, `git commit`, `git remote add origin ...`, `git push`.
- [ ] В `vite.config.ts` указан `base: '/ИМЯ_РЕПОЗИТОРИЯ/'`.
- [ ] В `App.tsx` у `BrowserRouter` указан `basename={import.meta.env.BASE_URL}`.
- [ ] В репозитории есть `.github/workflows/deploy.yml` (или `deploy-gh-pages.yml`).
- [ ] В Settings → Pages выбран источник **GitHub Actions**.
- [ ] Если проект с Supabase — в Settings → Secrets and variables → Actions добавлены **VITE_SUPABASE_URL** и **VITE_SUPABASE_PUBLISHABLE_KEY**.
- [ ] В Actions один запуск прошёл успешно.
- [ ] Сайт открывается по `https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПОЗИТОРИЯ/`.

После этого проект будет автоматически публиковаться на GitHub Pages при каждом пуше в `main`.
