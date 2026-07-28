-- Командный вид аллокаций и append-only история комментариев к инициативе.

CREATE TABLE IF NOT EXISTS public.location_allocation_team_metrics (
  unit text NOT NULL,
  team text NOT NULL,
  fot_2025_rub bigint NULL CHECK (fot_2025_rub IS NULL OR fot_2025_rub >= 0),
  fot_2026_rub bigint NULL CHECK (fot_2026_rub IS NULL OR fot_2026_rub >= 0),
  unit_display_name text NULL,
  team_display_name text NULL,
  people_count_override integer NULL
    CHECK (people_count_override IS NULL OR people_count_override >= 0),
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (unit, team)
);

COMMENT ON TABLE public.location_allocation_team_metrics IS
  'Ручные корректировки командного представления аллокаций. NULL означает расчёт из исходных данных.';

ALTER TABLE public.location_allocation_team_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read allocation team metrics"
  ON public.location_allocation_team_metrics;
CREATE POLICY "Admins read allocation team metrics"
  ON public.location_allocation_team_metrics
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins write allocation team metrics"
  ON public.location_allocation_team_metrics;
CREATE POLICY "Admins write allocation team metrics"
  ON public.location_allocation_team_metrics
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.location_allocation_team_metrics TO authenticated;

CREATE TABLE IF NOT EXISTS public.initiative_allocation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  author_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_initiative_allocation_comments_initiative_created
  ON public.initiative_allocation_comments (initiative_id, created_at DESC);

COMMENT ON TABLE public.initiative_allocation_comments IS
  'Append-only история комментариев внутри инициативы на странице аллокаций.';

-- Старый формат хранил один комментарий внутри geo_cost_split без автора.
-- Переносим его в историю один раз; если в created_by/updated_by есть пользователь
-- или почта, восстанавливаем подпись из «Доступов», профиля либо auth.users.
DROP TRIGGER IF EXISTS trg_fill_initiative_allocation_comment_author
  ON public.initiative_allocation_comments;

INSERT INTO public.initiative_allocation_comments (
  initiative_id,
  body,
  author_user_id,
  author_name,
  author_email,
  created_at
)
SELECT
  i.id,
  trim(i.geo_cost_split ->> 'note'),
  source_user.id,
  COALESCE(
    NULLIF(trim(allowed.display_name), ''),
    NULLIF(trim(profile.full_name), ''),
    NULLIF(trim(source_user.email), ''),
    'Импортировано из старого формата'
  ),
  COALESCE(NULLIF(trim(source_user.email), ''), 'legacy@local.invalid'),
  COALESCE(i.updated_at, i.created_at, timezone('utc'::text, now()))
FROM public.initiatives i
LEFT JOIN LATERAL (
  SELECT u.id, u.email
  FROM auth.users u
  WHERE
    u.id::text = NULLIF(trim(COALESCE(i.updated_by, i.created_by, '')), '')
    OR lower(u.email) = lower(NULLIF(trim(COALESCE(i.updated_by, i.created_by, '')), ''))
  LIMIT 1
) source_user ON true
LEFT JOIN public.allowed_users allowed
  ON lower(allowed.email) = lower(source_user.email)
LEFT JOIN public.profiles profile
  ON profile.id = source_user.id
WHERE
  NULLIF(trim(i.geo_cost_split ->> 'note'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.initiative_allocation_comments existing
    WHERE
      existing.initiative_id = i.id
      AND trim(existing.body) = trim(i.geo_cost_split ->> 'note')
  );

CREATE OR REPLACE FUNCTION public.fill_initiative_allocation_comment_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  v_email := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Authenticated email is required';
  END IF;

  SELECT NULLIF(trim(a.display_name), '')
    INTO v_name
  FROM public.allowed_users a
  WHERE lower(a.email) = v_email
  LIMIT 1;

  IF v_name IS NULL THEN
    SELECT NULLIF(trim(p.full_name), '')
      INTO v_name
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1;
  END IF;

  NEW.author_user_id := auth.uid();
  NEW.author_email := v_email;
  NEW.author_name := COALESCE(v_name, v_email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_initiative_allocation_comment_author
  ON public.initiative_allocation_comments;
CREATE TRIGGER trg_fill_initiative_allocation_comment_author
  BEFORE INSERT ON public.initiative_allocation_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_initiative_allocation_comment_author();

ALTER TABLE public.initiative_allocation_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read initiative allocation comments"
  ON public.initiative_allocation_comments;
CREATE POLICY "Admins read initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins add initiative allocation comments"
  ON public.initiative_allocation_comments;
CREATE POLICY "Admins add initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    AND (author_user_id IS NULL OR author_user_id = auth.uid())
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

GRANT SELECT, INSERT ON public.initiative_allocation_comments TO authenticated;
