-- Run this in Supabase Dashboard → SQL Editor to create tables for the new project.
-- Enable UUID extension (usually already on in new projects)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- initiatives
CREATE TABLE public.initiatives (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz,
  created_by text,
  description text,
  documentation_link text,
  initiative text NOT NULL,
  initiative_type text,
  quarterly_data jsonb DEFAULT '{}',
  stakeholders text,
  stakeholders_list text[],
  team text NOT NULL,
  unit text NOT NULL,
  updated_at timestamptz,
  updated_by text
);

-- people
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  email text,
  external_id text,
  full_name text NOT NULL,
  hired_at timestamptz,
  hr_structure text,
  leader text,
  position text,
  team text,
  terminated_at timestamptz,
  unit text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- person_initiative_assignments (depends on initiatives, people)
CREATE TABLE public.person_initiative_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  is_auto boolean DEFAULT false,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  quarterly_effort jsonb DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- initiative_history
CREATE TABLE public.initiative_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_type text NOT NULL,
  changed_at timestamptz,
  changed_by text,
  field_name text,
  initiative_id uuid REFERENCES public.initiatives(id) ON DELETE SET NULL,
  new_value jsonb,
  old_value jsonb
);

-- person_assignment_history
CREATE TABLE public.person_assignment_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid REFERENCES public.person_initiative_assignments(id) ON DELETE SET NULL,
  change_type text NOT NULL,
  changed_at timestamptz,
  changed_by text,
  field_name text,
  initiative_id uuid,
  new_value jsonb,
  old_value jsonb,
  person_id uuid
);

-- profiles (for auth users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_url text,
  created_at timestamptz,
  email text NOT NULL,
  full_name text
);

-- team_quarter_snapshots
CREATE TABLE public.team_quarter_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by text,
  imported_at timestamptz,
  person_ids uuid[] DEFAULT '{}',
  quarter text NOT NULL,
  source text DEFAULT '',
  team text NOT NULL,
  unit text NOT NULL
);

-- Optional: enable RLS and add policies (adjust as needed for your auth)
ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_initiative_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiative_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_quarter_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (tune for your rules)
CREATE POLICY "Allow all for authenticated" ON public.initiatives FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.people FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.person_initiative_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.initiative_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.person_assignment_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.team_quarter_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
