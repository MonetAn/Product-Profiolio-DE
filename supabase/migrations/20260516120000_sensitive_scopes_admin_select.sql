-- Admin (не super_admin): только SELECT sensitive_scopes — для клиентского маскирования тримапа.
-- Запись по-прежнему только у super_admin (политика FOR ALL).

DROP POLICY IF EXISTS "Admins read sensitive_scopes" ON public.sensitive_scopes;

CREATE POLICY "Admins read sensitive_scopes"
  ON public.sensitive_scopes FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    AND NOT public.current_user_is_super_admin()
  );
