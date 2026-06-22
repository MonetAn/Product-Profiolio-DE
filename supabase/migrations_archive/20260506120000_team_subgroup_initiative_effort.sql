-- Доли усилий на уровне подкоманда × инициатива × квартал (режим «Подкоманды» на экране усилий по людям).

CREATE TABLE public.team_subgroup_initiative_effort (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subgroup_id uuid NOT NULL REFERENCES public.team_effort_subgroups(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  quarterly_effort jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subgroup_id, initiative_id)
);

CREATE INDEX idx_subgroup_initiative_effort_initiative ON public.team_subgroup_initiative_effort (initiative_id);

ALTER TABLE public.team_subgroup_initiative_effort ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users only" ON public.team_subgroup_initiative_effort
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.team_effort_subgroups s
      WHERE s.id = team_subgroup_initiative_effort.subgroup_id
      AND public.user_can_see_unit_team(s.unit, s.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = team_subgroup_initiative_effort.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.team_effort_subgroups s
      WHERE s.id = team_subgroup_initiative_effort.subgroup_id
      AND public.user_can_see_unit_team(s.unit, s.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.initiatives i
      WHERE i.id = team_subgroup_initiative_effort.initiative_id
      AND public.user_can_see_unit_team(i.unit, i.team)
    )
  );

COMMENT ON TABLE public.team_subgroup_initiative_effort IS 'Квартальные % усилий подкоманды по инициативам (не агрегирует в person_initiative_assignments автоматически).';
