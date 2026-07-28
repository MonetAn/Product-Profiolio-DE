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
