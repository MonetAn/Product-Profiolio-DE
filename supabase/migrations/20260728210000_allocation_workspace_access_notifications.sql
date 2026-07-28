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
