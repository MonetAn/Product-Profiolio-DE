-- Диагностика RLS / раннего доступа для «Объединение».
-- Supabase Dashboard → SQL Editor → Run (блоки по очереди или весь файл).

-- ========== 1) Таблицы есть? ==========
SELECT to_regclass('public.cross_initiatives') AS cross_initiatives,
       to_regclass('public.cross_initiative_members') AS cross_initiative_members;
-- Ожидание: оба не NULL.

-- ========== 2) Политики cross_initiatives ==========
-- polcmd: r=SELECT, a=INSERT, w=UPDATE, d=DELETE, *=ALL
SELECT polname,
       CASE polcmd
         WHEN 'r' THEN 'SELECT'
         WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE'
         WHEN 'd' THEN 'DELETE'
         WHEN '*' THEN 'ALL ← УДАЛИТЬ (блокирует INSERT)'
         ELSE polcmd::text
       END AS command,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'cross_initiatives'
ORDER BY polname;

-- Ожидание (5 политик, без "Early access cross initiatives" на ALL):
--   Early access cross initiatives select
--   Early access cross initiatives insert   → with_check: current_user_has_early_access()
--   Early access cross initiatives update
--   Early access cross initiatives delete
-- Красный флаг: политика "Early access cross initiatives" с command ALL
--   или нет insert / with_check без current_user_has_early_access().

-- ========== 3) early_access в БД (подставьте email) ==========
SELECT email, role, early_access
FROM public.allowed_users
WHERE LOWER(email) = LOWER('YOUR_EMAIL@example.com');
-- Ожидание: early_access = true.

-- ========== 4) Функции на месте ==========
WITH expected(proname, expected_args) AS (
  VALUES
    ('current_user_has_early_access', ''),
    ('get_cross_initiatives_bundle', ''),
    ('create_cross_initiative_with_members', 'p_name text, p_initiative_ids uuid[], p_created_by text')
),
found AS (
  SELECT p.proname,
         pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (SELECT e.proname FROM expected e)
)
SELECT e.proname,
       COALESCE(f.args, '—') AS args,
       CASE
         WHEN f.proname IS NULL THEN 'ОТСУТСТВУЕТ — выполните fix_cross_initiatives_rls_prod.sql'
         WHEN e.proname = 'create_cross_initiative_with_members'
              AND f.args NOT LIKE '%uuid[]%'
           THEN 'НЕВЕРНАЯ СИГНАТУРА'
         ELSE 'ok'
       END AS status
FROM expected e
LEFT JOIN found f ON f.proname = e.proname
ORDER BY e.proname;
-- Ожидание: три строки со status = ok.
-- Если create_cross_initiative_with_members = ОТСУТСТВУЕТ — UI падает на INSERT или fallback без RPC.

-- ========== 5) Миграции в schema_migrations (если используете CLI) ==========
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name LIKE '%cross_initiatives%'
ORDER BY version;
-- Ожидание на проде: как минимум 20260526140000, 20260526150000, 20260526160000.

-- ========== 6) В браузере (не SQL Editor) ==========
-- DevTools → Network → get_my_access → Response: "has_early_access": true
-- Если false при early_access=true в БД:
--   sessionStorage.removeItem('app_access'); жёсткое обновление; перелогин.
-- DevTools → при создании связи: POST rpc/create_cross_initiative_with_members (не insert cross_initiatives).
-- Если только insert cross_initiatives — на проде нет RPC (нужен fix_cross_initiatives_rls_prod.sql).

-- ========== 7) Тест RPC (замените UUID на две видимые инициативы) ==========
-- SELECT public.create_cross_initiative_with_members(
--   'Тест RLS ' || to_char(now(), 'HH24:MI'),
--   ARRAY[
--     '11111111-1111-1111-1111-111111111111'::uuid,
--     '22222222-2222-2222-2222-222222222222'::uuid
--   ],
--   'sql-editor-test'
-- );
-- Успех → uuid. early_access_required → нет early_access у JWT-пользователя в Editor (нормально).
-- initiative_not_visible → неверные UUID или нет доступа к инициативам.
