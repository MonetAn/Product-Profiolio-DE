-- Create table for quarterly team snapshots
CREATE TABLE public.team_quarter_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL,
  team text NOT NULL,
  quarter text NOT NULL,
  person_ids uuid[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'csv_import',
  imported_at timestamptz DEFAULT now(),
  created_by uuid,
  
  UNIQUE(unit, team, quarter)
);

-- Enable RLS
ALTER TABLE public.team_quarter_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies for Dodo employees
CREATE POLICY "Dodo employees can view snapshots"
ON public.team_quarter_snapshots
FOR SELECT
USING (is_dodo_employee());

CREATE POLICY "Dodo employees can create snapshots"
ON public.team_quarter_snapshots
FOR INSERT
WITH CHECK (is_dodo_employee());

CREATE POLICY "Dodo employees can update snapshots"
ON public.team_quarter_snapshots
FOR UPDATE
USING (is_dodo_employee());

CREATE POLICY "Dodo employees can delete snapshots"
ON public.team_quarter_snapshots
FOR DELETE
USING (is_dodo_employee());

-- Create index for faster lookups
CREATE INDEX idx_team_quarter_snapshots_lookup 
ON public.team_quarter_snapshots(unit, team, quarter);