-- Порядок команд относится к структурным действиям и временно доступен
-- только a.monetov@dodobrands.io, как добавление, переименование и удаление.

CREATE OR REPLACE FUNCTION public.guard_allocation_scenario_team_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_can_manage_allocation_scenario_teams() THEN
    RETURN NEW;
  END IF;

  IF
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.source_unit IS DISTINCT FROM OLD.source_unit
    OR NEW.source_team IS DISTINCT FROM OLD.source_team
    OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
    OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
  THEN
    RAISE EXCEPTION
      'Only the allocation scenario team manager can change team structure'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
