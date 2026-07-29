-- Безопасный справочник аватаров только для авторов комментариев аллокаций.
-- Обычным пользователям не открываются остальные поля таблицы allowed_users.

CREATE OR REPLACE FUNCTION public.get_allocation_comment_author_profiles()
RETURNS TABLE (
  email text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_has_access() THEN
    RAISE EXCEPTION 'Application access is required';
  END IF;

  RETURN QUERY
  SELECT
    lower(trim(allowed.email)) AS email,
    NULLIF(trim(allowed.avatar_url), '') AS avatar_url
  FROM public.allowed_users allowed
  WHERE
    NULLIF(trim(allowed.avatar_url), '') IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.initiative_allocation_comments comment
        WHERE lower(trim(comment.author_email)) = lower(trim(allowed.email))
      )
      OR EXISTS (
        SELECT 1
        FROM public.initiative_allocation_comment_replies reply
        WHERE lower(trim(reply.author_email)) = lower(trim(allowed.email))
      )
    )
  ORDER BY lower(trim(allowed.email));
END;
$$;

REVOKE ALL ON FUNCTION public.get_allocation_comment_author_profiles()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_allocation_comment_author_profiles()
  TO authenticated;

COMMENT ON FUNCTION public.get_allocation_comment_author_profiles() IS
  'Email и фото пользователей, уже писавших в комментариях аллокаций.';
