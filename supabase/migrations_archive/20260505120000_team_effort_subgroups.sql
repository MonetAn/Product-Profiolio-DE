-- Подкоманды для UX заполнения усилий по людям (persisted). Одна запись участия на человека (глобально).

CREATE TABLE public.team_effort_subgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL,
  team text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_effort_subgroups_scope ON public.team_effort_subgroups (unit, team);

CREATE TABLE public.team_effort_subgroup_members (
  subgroup_id uuid NOT NULL REFERENCES public.team_effort_subgroups(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  PRIMARY KEY (subgroup_id, person_id)
);

-- Один человек не более чем в одной подкоманде (для текущей модели состава).
CREATE UNIQUE INDEX uq_team_effort_subgroup_members_person ON public.team_effort_subgroup_members (person_id);

ALTER TABLE public.team_effort_subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_effort_subgroup_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users only" ON public.team_effort_subgroups
  FOR ALL TO authenticated
  USING (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team))
  WITH CHECK (public.current_user_has_access() AND public.user_can_see_unit_team(unit, team));

CREATE POLICY "Allowed users only" ON public.team_effort_subgroup_members
  FOR ALL TO authenticated
  USING (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.team_effort_subgroups s
      WHERE s.id = team_effort_subgroup_members.subgroup_id
      AND public.user_can_see_unit_team(s.unit, s.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = team_effort_subgroup_members.person_id
      AND public.user_can_see_unit_team(p.unit, p.team)
    )
  )
  WITH CHECK (
    public.current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.team_effort_subgroups s
      WHERE s.id = team_effort_subgroup_members.subgroup_id
      AND public.user_can_see_unit_team(s.unit, s.team)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = team_effort_subgroup_members.person_id
      AND public.user_can_see_unit_team(p.unit, p.team)
    )
  );

COMMENT ON TABLE public.team_effort_subgroups IS 'Именованные подкоманды внутри unit/team для группировки при заполнении усилий по людям.';
COMMENT ON TABLE public.team_effort_subgroup_members IS 'Принадлежность человека подкоманде (не более одной записи на person_id).';
