-- Create people table (employee directory)
CREATE TABLE public.people (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text,
  full_name text NOT NULL,
  email text,
  hr_structure text,
  unit text,
  team text,
  position text,
  leader text,
  hired_at date,
  terminated_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- Create person_initiative_assignments table (links people to initiatives with effort %)
CREATE TABLE public.person_initiative_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  quarterly_effort jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(person_id, initiative_id)
);

-- Create assignment history for audit trail
CREATE TABLE public.person_assignment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES public.person_initiative_assignments(id) ON DELETE SET NULL,
  person_id uuid,
  initiative_id uuid,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  change_type text NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb
);

-- Enable RLS on all tables
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_initiative_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_assignment_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for people table
CREATE POLICY "Dodo employees can view people" 
  ON public.people FOR SELECT 
  USING (is_dodo_employee());

CREATE POLICY "Dodo employees can create people" 
  ON public.people FOR INSERT 
  WITH CHECK (is_dodo_employee());

CREATE POLICY "Dodo employees can update people" 
  ON public.people FOR UPDATE 
  USING (is_dodo_employee());

CREATE POLICY "Dodo employees can delete people" 
  ON public.people FOR DELETE 
  USING (is_dodo_employee());

-- RLS policies for assignments table
CREATE POLICY "Dodo employees can view assignments" 
  ON public.person_initiative_assignments FOR SELECT 
  USING (is_dodo_employee());

CREATE POLICY "Dodo employees can create assignments" 
  ON public.person_initiative_assignments FOR INSERT 
  WITH CHECK (is_dodo_employee());

CREATE POLICY "Dodo employees can update assignments" 
  ON public.person_initiative_assignments FOR UPDATE 
  USING (is_dodo_employee());

CREATE POLICY "Dodo employees can delete assignments" 
  ON public.person_initiative_assignments FOR DELETE 
  USING (is_dodo_employee());

-- RLS policies for assignment history
CREATE POLICY "Dodo employees can view assignment history" 
  ON public.person_assignment_history FOR SELECT 
  USING (is_dodo_employee());

CREATE POLICY "Dodo employees can insert assignment history" 
  ON public.person_assignment_history FOR INSERT 
  WITH CHECK (is_dodo_employee());

-- Create indexes for performance
CREATE INDEX idx_people_unit ON public.people(unit);
CREATE INDEX idx_people_team ON public.people(team);
CREATE INDEX idx_people_email ON public.people(email);
CREATE INDEX idx_assignments_person ON public.person_initiative_assignments(person_id);
CREATE INDEX idx_assignments_initiative ON public.person_initiative_assignments(initiative_id);

-- Trigger to update timestamps
CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.person_initiative_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();