-- Подтверждение состава команды по кварталу (quick flow / админка)
ALTER TABLE public.team_quarter_snapshots
  ADD COLUMN IF NOT EXISTS roster_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS roster_confirmed_by_name text;

COMMENT ON COLUMN public.team_quarter_snapshots.roster_confirmed_at IS 'Когда лидер отметил состав как проверенный';
COMMENT ON COLUMN public.team_quarter_snapshots.roster_confirmed_by IS 'auth.users.id подтвердившего';
COMMENT ON COLUMN public.team_quarter_snapshots.roster_confirmed_by_name IS 'ФИО/имя для отображения (снимок на момент подтверждения)';
