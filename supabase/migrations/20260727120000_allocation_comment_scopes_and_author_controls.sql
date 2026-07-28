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
