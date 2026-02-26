-- Add is_auto flag to track auto-assigned vs manually edited effort values
ALTER TABLE public.person_initiative_assignments
ADD COLUMN is_auto boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.person_initiative_assignments.is_auto IS 
  'true = автопроставлено из initiative effortCoefficient, false = вручную отредактировано';