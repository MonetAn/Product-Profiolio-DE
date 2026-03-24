-- Глобальная блокировка на время предпросмотра расчёта Google Sheet (одна операция за раз).
-- Вызывается только из Edge Functions с service_role.

CREATE TABLE IF NOT EXISTS public.sheet_preview_lock (
  id smallint PRIMARY KEY CHECK (id = 1),
  locked_until timestamptz NOT NULL DEFAULT TIMESTAMPTZ 'epoch',
  holder_id uuid
);

INSERT INTO public.sheet_preview_lock (id, locked_until, holder_id)
VALUES (1, TIMESTAMPTZ 'epoch', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sheet_preview_lock ENABLE ROW LEVEL SECURITY;

-- Никому из клиентов напрямую; только service_role обходит RLS
CREATE POLICY "sheet_preview_lock_no_select"
  ON public.sheet_preview_lock FOR SELECT
  USING (false);

CREATE POLICY "sheet_preview_lock_no_modify"
  ON public.sheet_preview_lock FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.acquire_sheet_preview_lock(
  p_holder_id uuid,
  p_ttl_seconds integer DEFAULT 300
)
RETURNS TABLE (acquired boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.sheet_preview_lock%ROWTYPE;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 3600 THEN
    RETURN QUERY SELECT false, 'invalid_ttl'::text;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.sheet_preview_lock WHERE id = 1 FOR UPDATE;

  IF r.locked_until > now() AND r.holder_id IS DISTINCT FROM p_holder_id THEN
    RETURN QUERY SELECT false, 'busy'::text;
    RETURN;
  END IF;

  UPDATE public.sheet_preview_lock
  SET
    locked_until = now() + (p_ttl_seconds::text || ' seconds')::interval,
    holder_id = p_holder_id
  WHERE id = 1;

  RETURN QUERY SELECT true, 'ok'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sheet_preview_lock(p_holder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sheet_preview_lock
  SET
    locked_until = TIMESTAMPTZ 'epoch',
    holder_id = NULL
  WHERE id = 1 AND (holder_id IS NOT DISTINCT FROM p_holder_id OR locked_until < now());
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_sheet_preview_lock(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_sheet_preview_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_sheet_preview_lock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sheet_preview_lock(uuid) TO service_role;
