-- Супер-администраторы модерируют тестовые и устаревшие обсуждения аллокаций:
-- могут удалять любой корневой комментарий или ответ. Редактирование чужого
-- текста остаётся запрещено и по-прежнему доступно только автору.

CREATE OR REPLACE FUNCTION public.current_user_can_moderate_allocation_comments()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_is_super_admin();
$$;

COMMENT ON FUNCTION public.current_user_can_moderate_allocation_comments() IS
  'Супер-администраторы могут удалять любые комментарии и ответы в аллокациях.';

REVOKE ALL
  ON FUNCTION public.current_user_can_moderate_allocation_comments()
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.current_user_can_moderate_allocation_comments()
  TO authenticated;

DROP POLICY IF EXISTS "Authors delete initiative allocation comments"
  ON public.initiative_allocation_comments;
DROP POLICY IF EXISTS "Authors or moderators delete initiative allocation comments"
  ON public.initiative_allocation_comments;
CREATE POLICY "Authors or moderators delete initiative allocation comments"
  ON public.initiative_allocation_comments
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND (
      author_user_id = auth.uid()
      OR public.current_user_can_moderate_allocation_comments()
    )
  );

DROP POLICY IF EXISTS "Authors delete allocation comment replies"
  ON public.initiative_allocation_comment_replies;
DROP POLICY IF EXISTS "Authors or moderators delete allocation comment replies"
  ON public.initiative_allocation_comment_replies;
CREATE POLICY "Authors or moderators delete allocation comment replies"
  ON public.initiative_allocation_comment_replies
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_access()
    AND (
      author_user_id = auth.uid()
      OR public.current_user_can_moderate_allocation_comments()
    )
  );

-- Защитная уборка для записей, созданных до появления внешних ключей.
-- В актуальной схеме новые сиротские уведомления невозможны благодаря CASCADE.
DELETE FROM public.allocation_notifications notification
WHERE
  NOT EXISTS (
    SELECT 1
    FROM public.initiative_allocation_comments comment
    WHERE comment.id = notification.comment_id
  )
  OR (
    notification.reply_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.initiative_allocation_comment_replies reply
      WHERE reply.id = notification.reply_id
    )
  );
