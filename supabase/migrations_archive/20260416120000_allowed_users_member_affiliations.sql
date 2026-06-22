-- Несколько организационных привязок (юнит/команда) отдельно от области видимости данных.
-- member_unit / member_team синхронизируются с первой записью для обратной совместимости.

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS member_affiliations jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.allowed_users.member_affiliations IS
  'Справочные привязки [{unit, team?}], не влияют на RLS; область данных — allowed_units / allowed_team_pairs.';

UPDATE public.allowed_users
SET member_affiliations = jsonb_build_array(
  jsonb_build_object(
    'unit', btrim(member_unit),
    'team', NULLIF(btrim(COALESCE(member_team, '')), '')
  )
)
WHERE jsonb_array_length(member_affiliations) = 0
  AND member_unit IS NOT NULL
  AND btrim(member_unit) <> '';

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
        'is_admin', (a.role IN ('admin', 'super_admin')),
        'is_super_admin', (a.role = 'super_admin'),
        'can_view_money', (a.role IN ('admin', 'super_admin') OR COALESCE(a.can_view_money, true)),
        'display_name', a.display_name,
        'member_unit', a.member_unit,
        'member_team', a.member_team,
        'member_affiliations', COALESCE(a.member_affiliations, '[]'::jsonb),
        'scope', public.get_my_scope()
      )
      FROM public.allowed_users a
      WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      LIMIT 1
    ),
    '{"can_access": false, "is_admin": false, "is_super_admin": false, "can_view_money": true, "display_name": null, "member_unit": null, "member_team": null, "member_affiliations": [], "scope": {"see_all": true}}'::json
  );
$$;
