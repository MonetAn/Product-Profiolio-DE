-- Уведомления аллокаций по умолчанию приходят всем допущенным пользователям.
-- Каждый пользователь может сузить подписку до выбранных юнитов и команд.

CREATE TABLE IF NOT EXISTS public.allocation_notification_preferences (
  allowed_user_id uuid PRIMARY KEY
    REFERENCES public.allowed_users(id) ON DELETE CASCADE,
  all_scopes boolean NOT NULL DEFAULT true,
  selected_units text[] NOT NULL DEFAULT '{}'::text[],
  selected_team_pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT allocation_notification_preferences_team_pairs_array
    CHECK (jsonb_typeof(selected_team_pairs) = 'array')
);

ALTER TABLE public.allocation_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own allocation notification preferences"
  ON public.allocation_notification_preferences;
CREATE POLICY "Users read own allocation notification preferences"
  ON public.allocation_notification_preferences
  FOR SELECT TO authenticated
  USING (allowed_user_id = public.current_allowed_user_id());

DROP POLICY IF EXISTS "Users add own allocation notification preferences"
  ON public.allocation_notification_preferences;
CREATE POLICY "Users add own allocation notification preferences"
  ON public.allocation_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (allowed_user_id = public.current_allowed_user_id());

DROP POLICY IF EXISTS "Users update own allocation notification preferences"
  ON public.allocation_notification_preferences;
CREATE POLICY "Users update own allocation notification preferences"
  ON public.allocation_notification_preferences
  FOR UPDATE TO authenticated
  USING (allowed_user_id = public.current_allowed_user_id())
  WITH CHECK (allowed_user_id = public.current_allowed_user_id());

GRANT SELECT, INSERT, UPDATE
  ON public.allocation_notification_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.set_allocation_notification_preferences(
  p_all_scopes boolean,
  p_selected_units text[] DEFAULT '{}'::text[],
  p_selected_team_pairs jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_user_id uuid;
  v_all_scopes boolean := COALESCE(p_all_scopes, true);
  v_units text[] := '{}'::text[];
  v_pairs jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  v_allowed_user_id := public.current_allowed_user_id();
  IF v_allowed_user_id IS NULL THEN
    RAISE EXCEPTION 'Allowed user not found';
  END IF;

  IF jsonb_typeof(COALESCE(p_selected_team_pairs, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Selected team pairs must be a JSON array';
  END IF;

  IF NOT v_all_scopes THEN
    SELECT COALESCE(array_agg(unit ORDER BY unit), '{}'::text[])
    INTO v_units
    FROM (
      SELECT DISTINCT trim(requested_unit) AS unit
      FROM unnest(COALESCE(p_selected_units, '{}'::text[])) requested_unit
      WHERE
        NULLIF(trim(requested_unit), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.initiatives initiative
          WHERE
            initiative.deleted_at IS NULL
            AND trim(initiative.unit) = trim(requested_unit)
        )
    ) valid_units;

    WITH requested_pairs AS (
      SELECT
        trim(pair ->> 'unit') AS unit,
        trim(pair ->> 'team') AS team
      FROM jsonb_array_elements(
        COALESCE(p_selected_team_pairs, '[]'::jsonb)
      ) pair
      WHERE
        jsonb_typeof(pair) = 'object'
        AND NULLIF(trim(pair ->> 'unit'), '') IS NOT NULL
        AND NULLIF(trim(pair ->> 'team'), '') IS NOT NULL
    ),
    valid_pairs AS (
      SELECT DISTINCT requested.unit, requested.team
      FROM requested_pairs requested
      WHERE
        NOT (requested.unit = ANY(v_units))
        AND EXISTS (
          SELECT 1
          FROM public.initiatives initiative
          WHERE
            initiative.deleted_at IS NULL
            AND trim(initiative.unit) = requested.unit
            AND trim(initiative.team) = requested.team
        )
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('unit', unit, 'team', team)
        ORDER BY unit, team
      ),
      '[]'::jsonb
    )
    INTO v_pairs
    FROM valid_pairs;

    IF
      COALESCE(array_length(v_units, 1), 0) = 0
      AND jsonb_array_length(v_pairs) = 0
    THEN
      RAISE EXCEPTION 'Select at least one unit or team';
    END IF;
  END IF;

  INSERT INTO public.allocation_notification_preferences (
    allowed_user_id,
    all_scopes,
    selected_units,
    selected_team_pairs,
    updated_at
  )
  VALUES (
    v_allowed_user_id,
    v_all_scopes,
    CASE WHEN v_all_scopes THEN '{}'::text[] ELSE v_units END,
    CASE WHEN v_all_scopes THEN '[]'::jsonb ELSE v_pairs END,
    timezone('utc'::text, now())
  )
  ON CONFLICT (allowed_user_id) DO UPDATE
  SET
    all_scopes = EXCLUDED.all_scopes,
    selected_units = EXCLUDED.selected_units,
    selected_team_pairs = EXCLUDED.selected_team_pairs,
    updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_allocation_notification_preferences(
  boolean,
  text[],
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_allocation_notification_preferences(
  boolean,
  text[],
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocation_notification_scope_matches(
  p_allowed_user_id uuid,
  p_unit text,
  p_team text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_preferences public.allocation_notification_preferences%ROWTYPE;
  v_unit text := NULLIF(trim(COALESCE(p_unit, '')), '');
  v_team text := NULLIF(trim(COALESCE(p_team, '')), '');
BEGIN
  SELECT *
  INTO v_preferences
  FROM public.allocation_notification_preferences preferences
  WHERE preferences.allowed_user_id = p_allowed_user_id;

  -- Отсутствие строки — осознанное значение по умолчанию «всё».
  IF NOT FOUND OR v_preferences.all_scopes THEN
    RETURN true;
  END IF;

  IF v_unit IS NULL THEN
    RETURN false;
  END IF;

  IF v_unit = ANY(v_preferences.selected_units) THEN
    RETURN true;
  END IF;

  IF v_team IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_preferences.selected_team_pairs) pair
    WHERE
      trim(pair ->> 'unit') = v_unit
      AND trim(pair ->> 'team') = v_team
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocation_notification_scope_matches(
  uuid,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocation_notification_scope_matches(
  uuid,
  text,
  text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocation_comment_team(
  p_scope_type text,
  p_initiative_id uuid,
  p_scope_team text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_scope_type = 'initiative' THEN (
      SELECT NULLIF(trim(i.team), '')
      FROM public.initiatives i
      WHERE i.id = p_initiative_id
    )
    ELSE NULLIF(trim(COALESCE(p_scope_team, '')), '')
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
  v_team text;
BEGIN
  v_unit := public.allocation_comment_unit(
    NEW.scope_type,
    NEW.initiative_id,
    NEW.scope_unit
  );
  v_team := public.allocation_comment_team(
    NEW.scope_type,
    NEW.initiative_id,
    NEW.scope_team
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
    recipient.id,
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
    COALESCE(NEW.scope_team, v_team),
    left(NEW.body, 240)
  FROM public.allowed_users recipient
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.author_email)
  WHERE
    lower(recipient.email) <> lower(NEW.author_email)
    AND public.allocation_notification_scope_matches(
      recipient.id,
      v_unit,
      v_team
    )
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_allocation_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.initiative_allocation_comments%ROWTYPE;
  v_unit text;
  v_team text;
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
  v_team := public.allocation_comment_team(
    v_comment.scope_type,
    v_comment.initiative_id,
    v_comment.scope_team
  );

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
    recipient.id,
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
    COALESCE(v_comment.scope_team, v_team),
    left(NEW.body, 240)
  FROM public.allowed_users recipient
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.author_email)
  WHERE
    lower(recipient.email) <> lower(NEW.author_email)
    AND public.allocation_notification_scope_matches(
      recipient.id,
      v_unit,
      v_team
    )
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_allocation_comment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.initiative_allocation_comments%ROWTYPE;
  v_unit text;
  v_team text;
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
  v_team := public.allocation_comment_team(
    v_comment.scope_type,
    v_comment.initiative_id,
    v_comment.scope_team
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
    COALESCE(v_comment.scope_team, v_team),
    left(v_comment.body, 240)
  FROM public.allowed_users recipient
  LEFT JOIN public.allowed_users actor
    ON lower(actor.email) = lower(NEW.actor_email)
  WHERE
    lower(recipient.email) <> lower(NEW.actor_email)
    AND public.allocation_notification_scope_matches(
      recipient.id,
      v_unit,
      v_team
    )
  ON CONFLICT (
    recipient_allowed_user_id,
    event_type,
    source_id
  ) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.allocation_notification_preferences IS
  'Персональная область внутренних уведомлений аллокаций. Отсутствие строки означает подписку на всё.';
COMMENT ON TABLE public.allocation_unit_leaders IS
  'Лидеры юнитов для организационной роли и автоматического доступа; уведомления настраиваются отдельно.';
