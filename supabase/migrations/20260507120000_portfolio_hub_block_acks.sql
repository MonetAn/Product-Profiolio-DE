-- Shared acknowledgements for Quarterly Hub blocks (unit/team/quarter/block)

CREATE TABLE IF NOT EXISTS public.portfolio_hub_block_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL,
  team text NOT NULL,
  quarter text NOT NULL CHECK (quarter ~ '^\d{4}-Q[1-4]$'),
  block text NOT NULL CHECK (block IN ('coefficients','descriptions','planFact','geo')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL DEFAULT auth.uid(),
  confirmed_by_name text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_hub_block_acks_scope
  ON public.portfolio_hub_block_acks (unit, team, quarter, block);

CREATE INDEX IF NOT EXISTS idx_portfolio_hub_block_acks_scope_lookup
  ON public.portfolio_hub_block_acks (unit, team, quarter);

ALTER TABLE public.portfolio_hub_block_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users only" ON public.portfolio_hub_block_acks;
CREATE POLICY "Allowed users only" ON public.portfolio_hub_block_acks
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  )
  WITH CHECK (
    public.current_user_has_access()
    AND public.user_can_see_row_with_sensitive(unit, team)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_hub_block_acks TO authenticated;

COMMENT ON TABLE public.portfolio_hub_block_acks IS
  'Подтверждение блоков квартального обновления (общая отметка по unit/team/quarter/block для всех админов).';
COMMENT ON COLUMN public.portfolio_hub_block_acks.confirmed_by IS
  'auth.users.id пользователя, который последним подтвердил блок.';
COMMENT ON COLUMN public.portfolio_hub_block_acks.confirmed_by_name IS
  'Имя пользователя на момент подтверждения (для UI/аудита).';
