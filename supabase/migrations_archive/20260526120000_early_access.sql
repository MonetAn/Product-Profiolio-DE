-- Ранний доступ: флаг на allowed_users, RLS для экспериментальных данных, get_my_access.

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS early_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.allowed_users.early_access IS
  'Ранний доступ: видит экспериментальный функционал (маппинг инициатив, дашборды). Scope данных не расширяется.';

CREATE OR REPLACE FUNCTION public.current_user_has_early_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowed_users a
    WHERE LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
      AND a.early_access = true
  );
$$;

COMMENT ON FUNCTION public.current_user_has_early_access IS
  'TRUE только при early_access = true в allowed_users (любая роль).';

-- Только admin / super_admin может менять early_access при INSERT/UPDATE allowed_users.
CREATE OR REPLACE FUNCTION public.guard_allowed_users_early_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.early_access, false) AND NOT public.current_user_is_admin() THEN
      RAISE EXCEPTION 'early_access_may_only_be_set_by_admin';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.early_access IS DISTINCT FROM NEW.early_access) THEN
    IF NOT public.current_user_is_admin() THEN
      RAISE EXCEPTION 'early_access_may_only_be_changed_by_admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_allowed_users_early_access ON public.allowed_users;
CREATE TRIGGER trg_guard_allowed_users_early_access
  BEFORE INSERT OR UPDATE ON public.allowed_users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_allowed_users_early_access();

-- Маппинг инициатив (ранний доступ): пользователь связывает инициативы в рамках своего scope.
CREATE TABLE IF NOT EXISTS public.initiative_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  target_initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT initiative_mappings_distinct CHECK (source_initiative_id <> target_initiative_id),
  CONSTRAINT initiative_mappings_unique_pair UNIQUE (source_initiative_id, target_initiative_id)
);

COMMENT ON TABLE public.initiative_mappings IS
  'Связи инициатив для раннего доступа. Видимость только у early_access в пределах scope по unit/team.';

CREATE INDEX IF NOT EXISTS idx_initiative_mappings_source ON public.initiative_mappings (source_initiative_id);
CREATE INDEX IF NOT EXISTS idx_initiative_mappings_target ON public.initiative_mappings (target_initiative_id);

CREATE OR REPLACE FUNCTION public.user_can_see_initiative_id(p_initiative_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.initiatives i
    WHERE i.id = p_initiative_id
      AND public.current_user_has_access()
      AND public.user_can_see_row_with_sensitive(i.unit, i.team)
      AND (i.deleted_at IS NULL OR public.is_super_admin())
  );
$$;

ALTER TABLE public.initiative_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Early access initiative mappings" ON public.initiative_mappings;
CREATE POLICY "Early access initiative mappings"
  ON public.initiative_mappings
  FOR ALL
  TO authenticated
  USING (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(source_initiative_id)
    AND public.user_can_see_initiative_id(target_initiative_id)
  )
  WITH CHECK (
    public.current_user_has_early_access()
    AND public.user_can_see_initiative_id(source_initiative_id)
    AND public.user_can_see_initiative_id(target_initiative_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.initiative_mappings TO authenticated;

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
        'has_early_access', COALESCE(a.early_access, false),
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
    '{"can_access": false, "is_admin": false, "is_super_admin": false, "has_early_access": false, "can_view_money": true, "display_name": null, "member_unit": null, "member_team": null, "member_affiliations": [], "scope": {"see_all": true}}'::json
  );
$$;
