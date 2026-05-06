-- Объединить команды App&Web/X-menu и App&Web/X-men(u). Оставить X-men(u).
-- В реальности затрагивает 1 строку в initiatives.
--
-- Применение (preview):
--   scripts/db-psql.sh -f scripts/sql/fix_xmenu_to_xmenuparenthesis.sql
-- Применение (запись):
--   замени "ROLLBACK;" на "COMMIT;" и запусти ещё раз.

\set ON_ERROR_STOP on

\echo '── BEFORE ──────────────────────────────────────────────────────────'
SELECT unit, team, COUNT(*) AS rows
FROM public.initiatives
WHERE unit='App&Web' AND team IN ('X-menu','X-men(u)')
GROUP BY unit, team ORDER BY team;

BEGIN;

UPDATE public.initiatives
   SET team = 'X-men(u)',
       updated_at = now()
 WHERE unit = 'App&Web' AND team = 'X-menu';

\echo ''
\echo '── AFTER (внутри транзакции) ───────────────────────────────────────'
SELECT unit, team, COUNT(*) AS rows
FROM public.initiatives
WHERE unit='App&Web' AND team IN ('X-menu','X-men(u)')
GROUP BY unit, team ORDER BY team;

\echo ''
\echo '── CONTROL: должно быть 17 строк в App&Web/X-men(u), 0 в X-menu ────'
SELECT 'X-men(u)' AS team, COUNT(*) AS rows FROM public.initiatives WHERE unit='App&Web' AND team='X-men(u)'
UNION ALL
SELECT 'X-menu',   COUNT(*) FROM public.initiatives WHERE unit='App&Web' AND team='X-menu';

COMMIT;
