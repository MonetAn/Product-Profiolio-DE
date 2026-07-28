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
