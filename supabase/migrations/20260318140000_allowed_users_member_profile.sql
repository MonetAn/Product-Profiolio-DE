-- Организационная привязка пользователя (отдельно от области видимости данных allowed_units / allowed_team_pairs).
-- member_unit / member_team могут быть NULL; команда только вместе с юнитом.

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS display_name text NULL,
  ADD COLUMN IF NOT EXISTS member_unit text NULL,
  ADD COLUMN IF NOT EXISTS member_team text NULL;

COMMENT ON COLUMN public.allowed_users.display_name IS 'Необязательное имя для списка доступов и поиска.';
COMMENT ON COLUMN public.allowed_users.member_unit IS 'Организационный юнит (справочно), опционально.';
COMMENT ON COLUMN public.allowed_users.member_team IS 'Команда внутри юнита, опционально; без юнита не задаётся.';

ALTER TABLE public.allowed_users DROP CONSTRAINT IF EXISTS allowed_users_member_team_requires_unit;
ALTER TABLE public.allowed_users ADD CONSTRAINT allowed_users_member_team_requires_unit
  CHECK (member_team IS NULL OR (member_unit IS NOT NULL AND btrim(member_unit) <> ''));

CREATE INDEX IF NOT EXISTS idx_allowed_users_member_unit ON public.allowed_users (member_unit)
  WHERE member_unit IS NOT NULL;

-- Возвращать профиль в get_my_access для будущей логики в приложении
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT json_build_object(
        'can_access', true,
        'is_admin', (a.role = 'admin'),
        'can_view_money', (a.role = 'admin' OR COALESCE(a.can_view_money, true)),
        'display_name', a.display_name,
        'member_unit', a.member_unit,
        'member_team', a.member_team,
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false, "can_view_money": true, "display_name": null, "member_unit": null, "member_team": null, "scope": {"see_all": true}}'::json
  );
$$;
