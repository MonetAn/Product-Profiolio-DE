-- Флаги портфеля без ALTER TABLE initiatives (избегаем lock timeout на проде).
-- is_portfolio_completed хранится здесь; ghost считается в приложении по quarterly_data.

CREATE TABLE IF NOT EXISTS public.initiative_portfolio_meta (
  initiative_id uuid PRIMARY KEY REFERENCES public.initiatives(id) ON DELETE CASCADE,
  is_portfolio_completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS initiative_portfolio_meta_completed_idx
  ON public.initiative_portfolio_meta (is_portfolio_completed)
  WHERE is_portfolio_completed = true;

ALTER TABLE public.initiative_portfolio_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio meta scoped access" ON public.initiative_portfolio_meta;
CREATE POLICY "portfolio meta scoped access" ON public.initiative_portfolio_meta
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_portfolio_meta.initiative_id
        AND i.deleted_at IS NULL
        AND public.user_can_see_unit_team(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = initiative_portfolio_meta.initiative_id
        AND i.deleted_at IS NULL
        AND public.user_can_see_unit_team(i.unit, i.team)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.initiative_portfolio_meta TO authenticated;
GRANT ALL ON public.initiative_portfolio_meta TO service_role;

COMMENT ON TABLE public.initiative_portfolio_meta IS
  'Портфельные флаги инициатив (завершена). Ghost — в приложении по данным 2026.';
