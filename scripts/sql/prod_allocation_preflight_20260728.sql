-- Безопасная проверка перед релизом: только чтение, ничего не меняет.

SELECT
  id,
  label,
  kind,
  is_active,
  snapshot_at
FROM public.portfolio_datasets
WHERE is_active;

SELECT
  (SELECT count(*) FROM public.initiatives WHERE deleted_at IS NULL)
    AS live_initiatives,
  (SELECT count(*) FROM public.allowed_users)
    AS allowed_users,
  (
    SELECT count(*)
    FROM public.initiatives
    WHERE NULLIF(trim(geo_cost_split ->> 'note'), '') IS NOT NULL
  ) AS legacy_comments_to_remove;

SELECT
  to_regclass('public.location_allocation_team_metrics') IS NOT NULL
    AS team_metrics_already_exists,
  to_regclass('public.initiative_allocation_comments') IS NOT NULL
    AS comments_already_exist,
  to_regclass('public.allocation_notifications') IS NOT NULL
    AS notifications_already_exist,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'allowed_users'
      AND column_name = 'avatar_url'
  ) AS avatar_column_already_exists;
