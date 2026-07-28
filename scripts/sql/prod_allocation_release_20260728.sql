-- Единый релиз аллокаций 2026-07-28. Запускать целиком в Supabase SQL Editor.
-- Все изменения выполняются в одной транзакции: при любой ошибке ничего не применится.

BEGIN;

-- ============================================================================
-- supabase/migrations/20260724120000_location_allocation_team_metrics_and_comments.sql
-- ============================================================================

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

-- ============================================================================
-- supabase/migrations/20260727120000_allocation_comment_scopes_and_author_controls.sql
-- ============================================================================

-- Комментарии к инициативам, командам и юнитам.
-- Редактировать и удалять комментарий может только его автор.

ALTER TABLE public.initiative_allocation_comments
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_unit text,
  ADD COLUMN IF NOT EXISTS scope_team text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.initiative_allocation_comments
SET
  scope_type = COALESCE(scope_type, 'initiative'),
  updated_at = COALESCE(updated_at, created_at);

ALTER TABLE public.initiative_allocation_comments
  ALTER COLUMN initiative_id DROP NOT NULL,
  ALTER COLUMN scope_type SET DEFAULT 'initiative',
  ALTER COLUMN scope_type SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now()),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE
      conrelid = 'public.initiative_allocation_comments'::regclass
      AND conname = 'initiative_allocation_comments_scope_check'
  ) THEN
    ALTER TABLE public.initiative_allocation_comments
      ADD CONSTRAINT initiative_allocation_comments_scope_check
      CHECK (
        (
          scope_type = 'initiative'
          AND initiative_id IS NOT NULL
          AND scope_unit IS NULL
          AND scope_team IS NULL
        )
        OR (
          scope_type = 'team'
          AND initiative_id IS NULL
          AND NULLIF(trim(scope_unit), '') IS NOT NULL
          AND NULLIF(trim(scope_team), '') IS NOT NULL
        )
        OR (
          scope_type = 'unit'
          AND initiative_id IS NULL
          AND NULLIF(trim(scope_unit), '') IS NOT NULL
          AND scope_team IS NULL
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_initiative_allocation_comments_scope_created
  ON public.initiative_allocation_comments (
    scope_type,
    scope_unit,
    scope_team,
    created_at DESC
  );

CREATE OR REPLACE FUNCTION public.guard_initiative_allocation_comment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
    OR NEW.initiative_id IS DISTINCT FROM OLD.initiative_id
    OR NEW.scope_unit IS DISTINCT FROM OLD.scope_unit
    OR NEW.scope_team IS DISTINCT FROM OLD.scope_team
    OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
    OR NEW.author_name IS DISTINCT FROM OLD.author_name
    OR NEW.author_email IS DISTINCT FROM OLD.author_email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Comment attribution and scope are immutable';
  END IF;

  NEW.body := trim(NEW.body);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Comment body cannot be empty';
  END IF;
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_initiative_allocation_comment_update
  ON public.initiative_allocation_comments;
CREATE TRIGGER trg_guard_initiative_allocation_comment_update
  BEFORE UPDATE ON public.initiative_allocation_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_initiative_allocation_comment_update();

DROP POLICY IF EXISTS "Authors update initiative allocation comments"
  ON public.initiative_allocation_comments;
CREATE POLICY "Authors update initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Authors delete initiative allocation comments"
  ON public.initiative_allocation_comments;
CREATE POLICY "Authors delete initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
  );

GRANT UPDATE (body), DELETE
  ON public.initiative_allocation_comments TO authenticated;

COMMENT ON TABLE public.initiative_allocation_comments IS
  'Комментарии к инициативам, командам и юнитам на странице аллокаций.';

-- ============================================================================
-- supabase/migrations/20260727150000_allocation_comment_workflow.sql
-- ============================================================================

-- Workflow комментариев: открытые/решённые, аудит статусов и персональное прочтение.

ALTER TABLE public.initiative_allocation_comments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_name text,
  ADD COLUMN IF NOT EXISTS resolved_by_email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE
      conrelid = 'public.initiative_allocation_comments'::regclass
      AND conname = 'initiative_allocation_comments_status_check'
  ) THEN
    ALTER TABLE public.initiative_allocation_comments
      ADD CONSTRAINT initiative_allocation_comments_status_check
      CHECK (
        (
          status = 'open'
          AND resolved_at IS NULL
          AND resolved_by IS NULL
          AND resolved_by_name IS NULL
          AND resolved_by_email IS NULL
        )
        OR (
          status = 'resolved'
          AND resolved_at IS NOT NULL
          AND resolved_by_name IS NOT NULL
          AND resolved_by_email IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_initiative_allocation_comments_open_scope
  ON public.initiative_allocation_comments (
    scope_type,
    scope_unit,
    scope_team,
    initiative_id
  )
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.initiative_allocation_comment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL
    REFERENCES public.initiative_allocation_comments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('resolved', 'reopened')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_initiative_allocation_comment_events_comment_created
  ON public.initiative_allocation_comment_events (comment_id, created_at DESC);

ALTER TABLE public.initiative_allocation_comment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read allocation comment events"
  ON public.initiative_allocation_comment_events;
CREATE POLICY "Admins read allocation comment events"
  ON public.initiative_allocation_comment_events
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

GRANT SELECT ON public.initiative_allocation_comment_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.initiative_allocation_comment_reads (
  comment_id uuid NOT NULL
    REFERENCES public.initiative_allocation_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_initiative_allocation_comment_reads_user
  ON public.initiative_allocation_comment_reads (user_id, read_at DESC);

ALTER TABLE public.initiative_allocation_comment_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own allocation comment reads"
  ON public.initiative_allocation_comment_reads;
CREATE POLICY "Users read own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users add own allocation comment reads"
  ON public.initiative_allocation_comment_reads;
CREATE POLICY "Users add own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users update own allocation comment reads"
  ON public.initiative_allocation_comment_reads;
CREATE POLICY "Users update own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE
  ON public.initiative_allocation_comment_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.set_initiative_allocation_comment_status(
  p_comment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_email text;
  v_name text;
  v_actor_id uuid;
  v_event_type text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Admin access is required';
  END IF;
  IF p_status NOT IN ('open', 'resolved') THEN
    RAISE EXCEPTION 'Unsupported comment status';
  END IF;

  SELECT status
    INTO v_current_status
  FROM public.initiative_allocation_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;
  IF v_current_status = p_status THEN
    RETURN;
  END IF;

  v_actor_id := auth.uid();
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
    WHERE p.id = v_actor_id
    LIMIT 1;
  END IF;

  v_name := COALESCE(v_name, v_email);
  v_event_type := CASE WHEN p_status = 'resolved' THEN 'resolved' ELSE 'reopened' END;

  UPDATE public.initiative_allocation_comments
  SET
    status = p_status,
    resolved_at = CASE
      WHEN p_status = 'resolved' THEN timezone('utc'::text, now())
      ELSE NULL
    END,
    resolved_by = CASE WHEN p_status = 'resolved' THEN v_actor_id ELSE NULL END,
    resolved_by_name = CASE WHEN p_status = 'resolved' THEN v_name ELSE NULL END,
    resolved_by_email = CASE WHEN p_status = 'resolved' THEN v_email ELSE NULL END
  WHERE id = p_comment_id;

  INSERT INTO public.initiative_allocation_comment_events (
    comment_id,
    event_type,
    actor_user_id,
    actor_name,
    actor_email
  ) VALUES (
    p_comment_id,
    v_event_type,
    v_actor_id,
    v_name,
    v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_initiative_allocation_comment_status(uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_initiative_allocation_comment_status(uuid, text)
  TO authenticated;

COMMENT ON TABLE public.initiative_allocation_comment_events IS
  'Аудит переводов комментариев в решённые и обратно в работу.';
COMMENT ON TABLE public.initiative_allocation_comment_reads IS
  'Персональная отметка последнего прочтения комментария.';

-- ============================================================================
-- supabase/migrations/20260728180000_allocation_comment_threads.sql
-- ============================================================================

-- Ответы внутри комментариев аллокаций.
-- Статус open/resolved остаётся только у корневого комментария:
-- ответы являются сообщениями треда и требуют только персонального прочтения.

-- Изменение статуса не является новым сообщением и не должно возвращать
-- персональную непрочитанность. updated_at меняется только при правке текста.
CREATE OR REPLACE FUNCTION public.guard_initiative_allocation_comment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
    OR NEW.initiative_id IS DISTINCT FROM OLD.initiative_id
    OR NEW.scope_unit IS DISTINCT FROM OLD.scope_unit
    OR NEW.scope_team IS DISTINCT FROM OLD.scope_team
    OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
    OR NEW.author_name IS DISTINCT FROM OLD.author_name
    OR NEW.author_email IS DISTINCT FROM OLD.author_email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Comment attribution and scope are immutable';
  END IF;

  NEW.body := trim(NEW.body);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Comment body cannot be empty';
  END IF;
  NEW.updated_at := CASE
    WHEN NEW.body IS DISTINCT FROM OLD.body
      THEN timezone('utc'::text, now())
    ELSE OLD.updated_at
  END;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.initiative_allocation_comment_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL
    REFERENCES public.initiative_allocation_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (NULLIF(trim(body), '') IS NOT NULL),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_allocation_comment_replies_comment_created
  ON public.initiative_allocation_comment_replies (comment_id, created_at);

DROP TRIGGER IF EXISTS trg_fill_allocation_comment_reply_author
  ON public.initiative_allocation_comment_replies;
CREATE TRIGGER trg_fill_allocation_comment_reply_author
  BEFORE INSERT ON public.initiative_allocation_comment_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_initiative_allocation_comment_author();

CREATE OR REPLACE FUNCTION public.guard_initiative_allocation_comment_reply_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.comment_id IS DISTINCT FROM OLD.comment_id
    OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
    OR NEW.author_name IS DISTINCT FROM OLD.author_name
    OR NEW.author_email IS DISTINCT FROM OLD.author_email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Reply attribution and thread are immutable';
  END IF;

  NEW.body := trim(NEW.body);
  IF NEW.body = '' THEN
    RAISE EXCEPTION 'Reply body cannot be empty';
  END IF;
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_allocation_comment_reply_update
  ON public.initiative_allocation_comment_replies;
CREATE TRIGGER trg_guard_allocation_comment_reply_update
  BEFORE UPDATE ON public.initiative_allocation_comment_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_initiative_allocation_comment_reply_update();

ALTER TABLE public.initiative_allocation_comment_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read allocation comment replies"
  ON public.initiative_allocation_comment_replies;
CREATE POLICY "Admins read allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins add allocation comment replies"
  ON public.initiative_allocation_comment_replies;
CREATE POLICY "Admins add allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    AND (author_user_id IS NULL OR author_user_id = auth.uid())
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Authors update allocation comment replies"
  ON public.initiative_allocation_comment_replies;
CREATE POLICY "Authors update allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Authors delete allocation comment replies"
  ON public.initiative_allocation_comment_replies;
CREATE POLICY "Authors delete allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    AND author_user_id = auth.uid()
  );

GRANT SELECT, INSERT ON public.initiative_allocation_comment_replies TO authenticated;
GRANT UPDATE (body), DELETE
  ON public.initiative_allocation_comment_replies TO authenticated;

CREATE TABLE IF NOT EXISTS public.initiative_allocation_comment_reply_reads (
  reply_id uuid NOT NULL
    REFERENCES public.initiative_allocation_comment_replies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (reply_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_allocation_comment_reply_reads_user
  ON public.initiative_allocation_comment_reply_reads (user_id, read_at DESC);

ALTER TABLE public.initiative_allocation_comment_reply_reads
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;
CREATE POLICY "Users read own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users add own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;
CREATE POLICY "Users add own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users update own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;
CREATE POLICY "Users update own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_admin()
    AND user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE
  ON public.initiative_allocation_comment_reply_reads TO authenticated;

-- Новые снимки портфеля сохраняют ответы вместе с корневыми комментариями.
CREATE OR REPLACE FUNCTION public.build_portfolio_dataset_payload()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'schema_version', 2,
    'captured_at', timezone('utc', now()),
    'initiatives', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.unit, i.team, i.initiative, i.id)
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
    ), '[]'::jsonb),
    'initiative_portfolio_meta', public._portfolio_snapshot_table('initiative_portfolio_meta'),
    'budget_department_allocations', public._portfolio_snapshot_table('initiative_budget_department_2026'),
    'budget_anchor', public._portfolio_snapshot_table('budget_portfolio_anchor_2026'),
    'team_baselines', public._portfolio_snapshot_table('team_budget_baseline_2026'),
    'team_manual_truth', public._portfolio_snapshot_table('team_budget_manual_truth_2026'),
    'cross_initiatives', public._portfolio_snapshot_table('cross_initiatives'),
    'cross_initiative_members', public._portfolio_snapshot_table('cross_initiative_members'),
    'people', public._portfolio_snapshot_table('people'),
    'person_initiative_assignments', public._portfolio_snapshot_table('person_initiative_assignments'),
    'person_assignment_history', public._portfolio_snapshot_table('person_assignment_history'),
    'team_quarter_snapshots', public._portfolio_snapshot_table('team_quarter_snapshots'),
    'market_countries', public._portfolio_snapshot_table('market_countries'),
    'sensitive_scopes', public._portfolio_snapshot_table('sensitive_scopes'),
    'treemap_layout_config', public._portfolio_snapshot_table('dashboard_treemap_layout_config'),
    'team_effort_subgroups', public._portfolio_snapshot_table('team_effort_subgroups'),
    'team_effort_subgroup_members', public._portfolio_snapshot_table('team_effort_subgroup_members'),
    'team_subgroup_initiative_effort', public._portfolio_snapshot_table('team_subgroup_initiative_effort'),
    'location_allocation_team_metrics', public._portfolio_snapshot_table('location_allocation_team_metrics'),
    'initiative_allocation_comments', public._portfolio_snapshot_table('initiative_allocation_comments'),
    'initiative_allocation_comment_events', public._portfolio_snapshot_table('initiative_allocation_comment_events'),
    'initiative_allocation_comment_replies', public._portfolio_snapshot_table('initiative_allocation_comment_replies')
  );
$$;

REVOKE ALL ON FUNCTION public.build_portfolio_dataset_payload()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_portfolio_dataset_payload()
  TO service_role;

COMMENT ON TABLE public.initiative_allocation_comment_replies IS
  'Ответы в тредах комментариев аллокаций. Не имеют статуса решения.';
COMMENT ON TABLE public.initiative_allocation_comment_reply_reads IS
  'Персональная отметка последнего прочтения ответа в треде.';

-- ============================================================================
-- supabase/migrations/20260728210000_allocation_workspace_access_notifications.sql
-- ============================================================================

-- Аллокации становятся общим рабочим разделом для всех пользователей из allowed_users.
-- Здесь же: лидеры юнитов, фотографии и внутренние уведомления по комментариям.

ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS avatar_url text NULL;

COMMENT ON COLUMN public.allowed_users.avatar_url IS
  'Фотография пользователя, вручную заданная в разделе «Доступ».';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Super admins upload user avatars" ON storage.objects;
CREATE POLICY "Super admins upload user avatars"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND public.current_user_is_super_admin()
  );

DROP POLICY IF EXISTS "Super admins update user avatars" ON storage.objects;
CREATE POLICY "Super admins update user avatars"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND public.current_user_is_super_admin()
  )
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND public.current_user_is_super_admin()
  );

DROP POLICY IF EXISTS "Super admins delete user avatars" ON storage.objects;
CREATE POLICY "Super admins delete user avatars"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND public.current_user_is_super_admin()
  );

CREATE TABLE IF NOT EXISTS public.allocation_unit_leaders (
  allowed_user_id uuid NOT NULL
    REFERENCES public.allowed_users(id) ON DELETE CASCADE,
  unit text NOT NULL CHECK (NULLIF(trim(unit), '') IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (allowed_user_id, unit)
);

CREATE INDEX IF NOT EXISTS idx_allocation_unit_leaders_unit
  ON public.allocation_unit_leaders (unit);

ALTER TABLE public.allocation_unit_leaders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users read allocation unit leaders"
  ON public.allocation_unit_leaders;
CREATE POLICY "Allowed users read allocation unit leaders"
  ON public.allocation_unit_leaders
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());

DROP POLICY IF EXISTS "Super admins manage allocation unit leaders"
  ON public.allocation_unit_leaders;
CREATE POLICY "Super admins manage allocation unit leaders"
  ON public.allocation_unit_leaders
  FOR ALL TO authenticated
  USING (public.current_user_is_super_admin())
  WITH CHECK (public.current_user_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.allocation_unit_leaders TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_unit_access_to_allocation_leader()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_units text[];
  v_pairs jsonb;
BEGIN
  SELECT
    COALESCE(allowed_units, '{}'::text[]),
    COALESCE(allowed_team_pairs, '[]'::jsonb)
  INTO v_units, v_pairs
  FROM public.allowed_users
  WHERE id = NEW.allowed_user_id
  FOR UPDATE;

  -- Пустая область уже означает полный доступ. Для ограниченной области
  -- лидерство автоматически добавляет весь назначенный юнит.
  IF
    COALESCE(array_length(v_units, 1), 0) > 0
    OR jsonb_array_length(v_pairs) > 0
  THEN
    UPDATE public.allowed_users
    SET allowed_units = CASE
      WHEN NEW.unit = ANY(v_units) THEN v_units
      ELSE array_append(v_units, NEW.unit)
    END
    WHERE id = NEW.allowed_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_unit_access_to_allocation_leader
  ON public.allocation_unit_leaders;
CREATE TRIGGER trg_grant_unit_access_to_allocation_leader
  AFTER INSERT OR UPDATE OF unit, allowed_user_id
  ON public.allocation_unit_leaders
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_unit_access_to_allocation_leader();

CREATE TABLE IF NOT EXISTS public.allocation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_allowed_user_id uuid NOT NULL
    REFERENCES public.allowed_users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (
      event_type IN (
        'comment_created',
        'reply_created',
        'comment_resolved',
        'comment_reopened'
      )
    ),
  source_id uuid NOT NULL,
  comment_id uuid NOT NULL
    REFERENCES public.initiative_allocation_comments(id) ON DELETE CASCADE,
  reply_id uuid NULL
    REFERENCES public.initiative_allocation_comment_replies(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  actor_avatar_url text NULL,
  scope_type text NOT NULL,
  initiative_id uuid NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  scope_unit text NULL,
  scope_team text NULL,
  message_excerpt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  read_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_allocation_notifications_dedupe
  ON public.allocation_notifications (
    recipient_allowed_user_id,
    event_type,
    source_id
  );

CREATE INDEX IF NOT EXISTS idx_allocation_notifications_recipient_unread
  ON public.allocation_notifications (
    recipient_allowed_user_id,
    created_at DESC
  )
  WHERE read_at IS NULL;

ALTER TABLE public.allocation_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_allowed_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.id
  FROM public.allowed_users a
  WHERE lower(a.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Users read own allocation notifications"
  ON public.allocation_notifications;
CREATE POLICY "Users read own allocation notifications"
  ON public.allocation_notifications
  FOR SELECT TO authenticated
  USING (recipient_allowed_user_id = public.current_allowed_user_id());

DROP POLICY IF EXISTS "Users mark own allocation notifications read"
  ON public.allocation_notifications;
CREATE POLICY "Users mark own allocation notifications read"
  ON public.allocation_notifications
  FOR UPDATE TO authenticated
  USING (recipient_allowed_user_id = public.current_allowed_user_id())
  WITH CHECK (recipient_allowed_user_id = public.current_allowed_user_id());

GRANT SELECT ON public.allocation_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.allocation_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.allocation_comment_unit(
  p_scope_type text,
  p_initiative_id uuid,
  p_scope_unit text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_scope_type = 'initiative' THEN (
      SELECT i.unit FROM public.initiatives i WHERE i.id = p_initiative_id
    )
    ELSE p_scope_unit
  END;
$$;

CREATE OR REPLACE FUNCTION public.notify_allocation_root_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit text;
BEGIN
  v_unit := public.allocation_comment_unit(
    NEW.scope_type,
    NEW.initiative_id,
    NEW.scope_unit
  );

  IF NULLIF(trim(COALESCE(v_unit, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.allocation_notifications (
    recipient_allowed_user_id,
    event_type,
    source_id,
    comment_id,
    actor_user_id,
    actor_name,
    actor_email,
    actor_avatar_url,
    scope_type,
    initiative_id,
    scope_unit,
    scope_team,
    message_excerpt
  )
  SELECT
    leader.allowed_user_id,
    'comment_created',
    NEW.id,
    NEW.id,
    NEW.author_user_id,
    NEW.author_name,
    NEW.author_email,
    actor.avatar_url,
    NEW.scope_type,
    NEW.initiative_id,
    COALESCE(NEW.scope_unit, v_unit),
    NEW.scope_team,
    left(NEW.body, 240)
  FROM public.allocation_unit_leaders leader
  JOIN public.allowed_users recipient
    ON recipient.id = leader.allowed_user_id
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.author_email)
  WHERE
    leader.unit = v_unit
    AND lower(recipient.email) <> lower(NEW.author_email)
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_allocation_root_comment
  ON public.initiative_allocation_comments;
CREATE TRIGGER trg_notify_allocation_root_comment
  AFTER INSERT ON public.initiative_allocation_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_allocation_root_comment();

CREATE OR REPLACE FUNCTION public.notify_allocation_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.initiative_allocation_comments%ROWTYPE;
  v_unit text;
BEGIN
  SELECT *
  INTO v_comment
  FROM public.initiative_allocation_comments
  WHERE id = NEW.comment_id;

  IF v_comment.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_unit := public.allocation_comment_unit(
    v_comment.scope_type,
    v_comment.initiative_id,
    v_comment.scope_unit
  );

  WITH recipient_ids AS (
    SELECT a.id
    FROM public.allowed_users a
    WHERE lower(a.email) = lower(v_comment.author_email)

    UNION

    SELECT a.id
    FROM public.initiative_allocation_comment_replies previous_reply
    JOIN public.allowed_users a
      ON lower(a.email) = lower(previous_reply.author_email)
    WHERE previous_reply.comment_id = NEW.comment_id

    UNION

    SELECT leader.allowed_user_id
    FROM public.allocation_unit_leaders leader
    WHERE leader.unit = v_unit
  )
  INSERT INTO public.allocation_notifications (
    recipient_allowed_user_id,
    event_type,
    source_id,
    comment_id,
    reply_id,
    actor_user_id,
    actor_name,
    actor_email,
    actor_avatar_url,
    scope_type,
    initiative_id,
    scope_unit,
    scope_team,
    message_excerpt
  )
  SELECT
    recipient_ids.id,
    'reply_created',
    NEW.id,
    NEW.comment_id,
    NEW.id,
    NEW.author_user_id,
    NEW.author_name,
    NEW.author_email,
    actor.avatar_url,
    v_comment.scope_type,
    v_comment.initiative_id,
    COALESCE(v_comment.scope_unit, v_unit),
    v_comment.scope_team,
    left(NEW.body, 240)
  FROM recipient_ids
  JOIN public.allowed_users recipient ON recipient.id = recipient_ids.id
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.author_email)
  WHERE lower(recipient.email) <> lower(NEW.author_email)
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_allocation_reply
  ON public.initiative_allocation_comment_replies;
CREATE TRIGGER trg_notify_allocation_reply
  AFTER INSERT ON public.initiative_allocation_comment_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_allocation_reply();

CREATE OR REPLACE FUNCTION public.notify_allocation_comment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.initiative_allocation_comments%ROWTYPE;
  v_unit text;
BEGIN
  SELECT *
  INTO v_comment
  FROM public.initiative_allocation_comments
  WHERE id = NEW.comment_id;

  IF v_comment.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_unit := public.allocation_comment_unit(
    v_comment.scope_type,
    v_comment.initiative_id,
    v_comment.scope_unit
  );

  INSERT INTO public.allocation_notifications (
    recipient_allowed_user_id,
    event_type,
    source_id,
    comment_id,
    actor_user_id,
    actor_name,
    actor_email,
    actor_avatar_url,
    scope_type,
    initiative_id,
    scope_unit,
    scope_team,
    message_excerpt
  )
  SELECT
    recipient.id,
    CASE
      WHEN NEW.event_type = 'resolved'
        THEN 'comment_resolved'
      ELSE 'comment_reopened'
    END,
    NEW.id,
    NEW.comment_id,
    NEW.actor_user_id,
    NEW.actor_name,
    NEW.actor_email,
    actor.avatar_url,
    v_comment.scope_type,
    v_comment.initiative_id,
    COALESCE(v_comment.scope_unit, v_unit),
    v_comment.scope_team,
    left(v_comment.body, 240)
  FROM public.allowed_users recipient
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.actor_email)
  WHERE
    lower(recipient.email) = lower(v_comment.author_email)
    AND lower(recipient.email) <> lower(NEW.actor_email)
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_allocation_comment_event
  ON public.initiative_allocation_comment_events;
CREATE TRIGGER trg_notify_allocation_comment_event
  AFTER INSERT ON public.initiative_allocation_comment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_allocation_comment_event();

-- Все допущенные пользователи могут читать и менять данные самого рабочего
-- раздела. Авторство текста сохраняется: правка/удаление — только автором.
DROP POLICY IF EXISTS "Admins read allocation team metrics"
  ON public.location_allocation_team_metrics;
DROP POLICY IF EXISTS "Admins write allocation team metrics"
  ON public.location_allocation_team_metrics;
DROP POLICY IF EXISTS "Allowed users read allocation team metrics"
  ON public.location_allocation_team_metrics;
DROP POLICY IF EXISTS "Allowed users write allocation team metrics"
  ON public.location_allocation_team_metrics;

CREATE POLICY "Allowed users read allocation team metrics"
  ON public.location_allocation_team_metrics
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());

CREATE POLICY "Allowed users write allocation team metrics"
  ON public.location_allocation_team_metrics
  FOR ALL TO authenticated
  USING (public.current_user_has_access())
  WITH CHECK (public.current_user_has_access());

DROP POLICY IF EXISTS "Admins read initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Admins add initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Authors update initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Authors delete initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Allowed users read initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Allowed users add initiative allocation comments"
  ON public.initiative_allocation_comments;

CREATE POLICY "Allowed users read initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());

CREATE POLICY "Allowed users add initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "Authors update initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "Authors delete initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins read allocation comment events"
  ON public.initiative_allocation_comment_events;
DROP POLICY IF EXISTS "Allowed users read allocation comment events"
  ON public.initiative_allocation_comment_events;
CREATE POLICY "Allowed users read allocation comment events"
  ON public.initiative_allocation_comment_events
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());

DROP POLICY IF EXISTS "Users read own allocation comment reads"
  ON public.initiative_allocation_comment_reads;
DROP POLICY IF EXISTS "Users add own allocation comment reads"
  ON public.initiative_allocation_comment_reads;
DROP POLICY IF EXISTS "Users update own allocation comment reads"
  ON public.initiative_allocation_comment_reads;

CREATE POLICY "Users read own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR SELECT TO authenticated
  USING (public.current_user_has_access() AND user_id = auth.uid());
CREATE POLICY "Users add own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_access() AND user_id = auth.uid());
CREATE POLICY "Users update own allocation comment reads"
  ON public.initiative_allocation_comment_reads
  FOR UPDATE TO authenticated
  USING (public.current_user_has_access() AND user_id = auth.uid())
  WITH CHECK (public.current_user_has_access() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Admins add allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Authors update allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Authors delete allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Allowed users read allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Allowed users add allocation comment replies"
  ON public.initiative_allocation_comment_replies;

CREATE POLICY "Allowed users read allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR SELECT TO authenticated
  USING (public.current_user_has_access());
CREATE POLICY "Allowed users add allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY "Authors update allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
    AND lower(author_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
CREATE POLICY "Authors delete allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND author_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users read own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;
DROP POLICY IF EXISTS "Users add own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;
DROP POLICY IF EXISTS "Users update own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads;

CREATE POLICY "Users read own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR SELECT TO authenticated
  USING (public.current_user_has_access() AND user_id = auth.uid());
CREATE POLICY "Users add own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_access() AND user_id = auth.uid());
CREATE POLICY "Users update own allocation reply reads"
  ON public.initiative_allocation_comment_reply_reads
  FOR UPDATE TO authenticated
  USING (public.current_user_has_access() AND user_id = auth.uid())
  WITH CHECK (public.current_user_has_access() AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_initiative_allocation_comment_status(
  p_comment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_email text;
  v_name text;
  v_actor_id uuid;
  v_event_type text;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;
  IF p_status NOT IN ('open', 'resolved') THEN
    RAISE EXCEPTION 'Unsupported comment status';
  END IF;

  SELECT status
  INTO v_current_status
  FROM public.initiative_allocation_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;
  IF v_current_status = p_status THEN
    RETURN;
  END IF;

  v_actor_id := auth.uid();
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
    WHERE p.id = v_actor_id
    LIMIT 1;
  END IF;

  v_name := COALESCE(v_name, v_email);
  v_event_type := CASE
    WHEN p_status = 'resolved' THEN 'resolved'
    ELSE 'reopened'
  END;

  UPDATE public.initiative_allocation_comments
  SET
    status = p_status,
    resolved_at = CASE
      WHEN p_status = 'resolved' THEN timezone('utc'::text, now())
      ELSE NULL
    END,
    resolved_by = CASE WHEN p_status = 'resolved' THEN v_actor_id ELSE NULL END,
    resolved_by_name = CASE WHEN p_status = 'resolved' THEN v_name ELSE NULL END,
    resolved_by_email = CASE WHEN p_status = 'resolved' THEN v_email ELSE NULL END
  WHERE id = p_comment_id;

  INSERT INTO public.initiative_allocation_comment_events (
    comment_id,
    event_type,
    actor_user_id,
    actor_name,
    actor_email
  )
  VALUES (
    p_comment_id,
    v_event_type,
    v_actor_id,
    v_name,
    v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_initiative_allocation_comment_status(uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_initiative_allocation_comment_status(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_location_allocation_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  RETURN jsonb_build_object(
    'initiatives',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.unit, i.team, i.initiative, i.id)
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
    ), '[]'::jsonb),
    'portfolio_meta',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.initiative_portfolio_meta m
      WHERE m.is_portfolio_completed = true
    ), '[]'::jsonb),
    'people',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'unit', p.unit,
          'team', p.team,
          'terminated_at', p.terminated_at
        )
        ORDER BY p.full_name, p.id
      )
      FROM public.people p
      WHERE p.deleted_at IS NULL
    ), '[]'::jsonb),
    'assignments',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'person_id', a.person_id,
          'initiative_id', a.initiative_id,
          'quarterly_effort', a.quarterly_effort,
          'is_auto', a.is_auto,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )
      )
      FROM public.person_initiative_assignments a
    ), '[]'::jsonb),
    'countries',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, c.label_ru, c.id)
      FROM public.market_countries c
      WHERE c.is_active = true
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_allocation_workspace()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_allocation_workspace()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_location_allocation_geo_split(
  p_initiative_id uuid,
  p_geo_cost_split jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  UPDATE public.initiatives
  SET
    geo_cost_split = CASE
      WHEN p_geo_cost_split IS NULL
        OR p_geo_cost_split = 'null'::jsonb
        OR p_geo_cost_split = '{}'::jsonb
      THEN NULL
      ELSE p_geo_cost_split
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_initiative_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  TO authenticated;

COMMENT ON TABLE public.allocation_unit_leaders IS
  'Лидеры юнитов для маршрутизации уведомлений в аллокациях.';
COMMENT ON TABLE public.allocation_notifications IS
  'Внутренние персональные уведомления по тредам комментариев аллокаций.';

-- ============================================================================
-- supabase/migrations/20260728220000_allocation_workspace_active_dataset.sql
-- ============================================================================

-- Аллокации используют тот же активный набор, что и основной дашборд.
-- Live-набор редактируется, snapshot возвращается только для чтения.

CREATE OR REPLACE FUNCTION public.get_location_allocation_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_dataset public.portfolio_datasets%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  SELECT *
  INTO v_dataset
  FROM public.portfolio_datasets
  WHERE is_active
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_dataset.id IS NOT NULL AND v_dataset.kind = 'snapshot' THEN
    v_payload := COALESCE(v_dataset.payload, '{}'::jsonb);

    RETURN jsonb_build_object(
      'dataset',
      jsonb_build_object(
        'id', v_dataset.id,
        'code', v_dataset.code,
        'label', v_dataset.label,
        'kind', v_dataset.kind,
        'period_start', v_dataset.period_start,
        'period_end', v_dataset.period_end,
        'snapshot_at', v_dataset.snapshot_at,
        'notes', v_dataset.notes
      ),
      'read_only', true,
      'initiatives',
      COALESCE(v_payload -> 'initiatives', '[]'::jsonb),
      'portfolio_meta',
      COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'initiative_portfolio_meta', '[]'::jsonb)
        ) AS item
        WHERE COALESCE((item ->> 'is_portfolio_completed')::boolean, false)
      ), '[]'::jsonb),
      'people',
      COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'people', '[]'::jsonb)
        ) AS item
        WHERE COALESCE(item ->> 'deleted_at', '') = ''
      ), '[]'::jsonb),
      'assignments',
      COALESCE(
        v_payload -> 'person_initiative_assignments',
        '[]'::jsonb
      ),
      'countries',
      COALESCE((
        SELECT jsonb_agg(item ORDER BY item ->> 'sort_order', item ->> 'label_ru')
        FROM jsonb_array_elements(
          COALESCE(v_payload -> 'market_countries', '[]'::jsonb)
        ) AS item
        WHERE COALESCE((item ->> 'is_active')::boolean, true)
      ), '[]'::jsonb),
      'team_metrics',
      COALESCE(
        v_payload -> 'location_allocation_team_metrics',
        '[]'::jsonb
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'dataset',
    jsonb_build_object(
      'id', v_dataset.id,
      'code', COALESCE(v_dataset.code, 'live'),
      'label', COALESCE(v_dataset.label, 'Текущие данные'),
      'kind', 'live',
      'period_start', v_dataset.period_start,
      'period_end', v_dataset.period_end,
      'snapshot_at', v_dataset.snapshot_at,
      'notes', v_dataset.notes
    ),
    'read_only', false,
    'initiatives',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.unit, i.team, i.initiative, i.id)
      FROM public.initiatives i
      WHERE i.deleted_at IS NULL
    ), '[]'::jsonb),
    'portfolio_meta',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.initiative_portfolio_meta m
      WHERE m.is_portfolio_completed = true
    ), '[]'::jsonb),
    'people',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'unit', p.unit,
          'team', p.team,
          'terminated_at', p.terminated_at
        )
        ORDER BY p.full_name, p.id
      )
      FROM public.people p
      WHERE p.deleted_at IS NULL
    ), '[]'::jsonb),
    'assignments',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'person_id', a.person_id,
          'initiative_id', a.initiative_id,
          'quarterly_effort', a.quarterly_effort,
          'is_auto', a.is_auto,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )
      )
      FROM public.person_initiative_assignments a
    ), '[]'::jsonb),
    'countries',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, c.label_ru, c.id)
      FROM public.market_countries c
      WHERE c.is_active = true
    ), '[]'::jsonb),
    'team_metrics',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.unit, m.team)
      FROM public.location_allocation_team_metrics m
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_allocation_workspace()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_allocation_workspace()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_location_allocation_geo_split(
  p_initiative_id uuid,
  p_geo_cost_split jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.portfolio_datasets
    WHERE is_active
      AND kind = 'snapshot'
  ) THEN
    RAISE EXCEPTION 'historical_dataset_read_only'
      USING ERRCODE = '25006';
  END IF;

  UPDATE public.initiatives
  SET
    geo_cost_split = CASE
      WHEN p_geo_cost_split IS NULL
        OR p_geo_cost_split = 'null'::jsonb
        OR p_geo_cost_split = '{}'::jsonb
      THEN NULL
      ELSE p_geo_cost_split
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_initiative_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_allocation_geo_split(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_location_allocation_workspace() IS
  'Аллокации из общего активного portfolio dataset. Snapshot возвращается с read_only=true.';

-- Одноразовая очистка старых тестовых комментариев по ранее подтверждённому запросу.
-- Коэффициенты распределения сохраняются; удаляется только legacy-поле note.
DELETE FROM public.initiative_allocation_comments;

UPDATE public.initiatives
SET geo_cost_split = NULLIF(geo_cost_split - 'note', '{}'::jsonb)
WHERE NULLIF(trim(geo_cost_split ->> 'note'), '') IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.location_allocation_team_metrics') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: team metrics table is missing';
  END IF;
  IF to_regclass('public.initiative_allocation_comments') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: comments table is missing';
  END IF;
  IF to_regclass('public.initiative_allocation_comment_replies') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: replies table is missing';
  END IF;
  IF to_regclass('public.allocation_notifications') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: notifications table is missing';
  END IF;
  IF to_regclass('public.allocation_unit_leaders') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: unit leaders table is missing';
  END IF;
  IF to_regprocedure('public.get_location_allocation_workspace()') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: workspace function is missing';
  END IF;
  IF to_regprocedure('public.set_location_allocation_geo_split(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'release_check_failed: geo split function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'allowed_users'
      AND column_name = 'avatar_url'
  ) THEN
    RAISE EXCEPTION 'release_check_failed: avatar_url is missing';
  END IF;
  IF (SELECT count(*) FROM public.portfolio_datasets WHERE is_active) <> 1 THEN
    RAISE EXCEPTION 'release_check_failed: exactly one dataset must be active';
  END IF;
END
$$;

COMMIT;

SELECT
  'allocation_release_ready' AS status,
  (SELECT label FROM public.portfolio_datasets WHERE is_active LIMIT 1) AS active_dataset,
  (SELECT kind FROM public.portfolio_datasets WHERE is_active LIMIT 1) AS dataset_kind,
  (SELECT count(*) FROM public.initiative_allocation_comments) AS comments_after_cleanup,
  (SELECT count(*) FROM public.initiative_allocation_comment_replies) AS replies_after_cleanup;
