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

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS directory_source text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS manual_added_by uuid,
  ADD COLUMN IF NOT EXISTS manual_added_by_name text,
  ADD COLUMN IF NOT EXISTS manual_review_status text,
  ADD COLUMN IF NOT EXISTS manual_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS manual_resolved_by_name text;

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

ALTER TABLE public.team_quarter_snapshots
  ADD COLUMN IF NOT EXISTS roster_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS roster_confirmed_by_name text;

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

-- Batch update for Edge Function sheets-pull-out (см. migrations/20260323140000_...)
CREATE OR REPLACE FUNCTION public.apply_initiatives_quarterly_data_batch(p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;

  UPDATE public.initiatives AS i
  SET
    quarterly_data = x.qd,
    updated_at = timezone('utc'::text, now())
  FROM (
    SELECT
      (elem->>'id')::uuid AS uid,
      (elem->'quarterly_data')::jsonb AS qd
    FROM jsonb_array_elements(p_updates) AS elem
    WHERE elem ? 'id'
      AND elem ? 'quarterly_data'
  ) AS x
  WHERE i.id = x.uid;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_initiatives_quarterly_data_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_initiatives_quarterly_data_batch(jsonb) TO service_role;

-- Lock для sheets-preview-calculation (см. migrations/20260314120000_sheet_preview_lock.sql)
CREATE TABLE IF NOT EXISTS public.sheet_preview_lock (
  id smallint PRIMARY KEY CHECK (id = 1),
  locked_until timestamptz NOT NULL DEFAULT TIMESTAMPTZ 'epoch',
  holder_id uuid
);
INSERT INTO public.sheet_preview_lock (id, locked_until, holder_id)
VALUES (1, TIMESTAMPTZ 'epoch', NULL)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.sheet_preview_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sheet_preview_lock_no_select" ON public.sheet_preview_lock FOR SELECT USING (false);
CREATE POLICY "sheet_preview_lock_no_modify" ON public.sheet_preview_lock FOR ALL USING (false) WITH CHECK (false);
CREATE OR REPLACE FUNCTION public.acquire_sheet_preview_lock(p_holder_id uuid, p_ttl_seconds integer DEFAULT 300)
RETURNS TABLE (acquired boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sheet_preview_lock%ROWTYPE;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 3600 THEN
    RETURN QUERY SELECT false, 'invalid_ttl'::text; RETURN;
  END IF;
  SELECT * INTO r FROM public.sheet_preview_lock WHERE id = 1 FOR UPDATE;
  IF r.locked_until > now() AND r.holder_id IS DISTINCT FROM p_holder_id THEN
    RETURN QUERY SELECT false, 'busy'::text; RETURN;
  END IF;
  UPDATE public.sheet_preview_lock SET
    locked_until = now() + (p_ttl_seconds::text || ' seconds')::interval,
    holder_id = p_holder_id
  WHERE id = 1;
  RETURN QUERY SELECT true, 'ok'::text;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_sheet_preview_lock(p_holder_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sheet_preview_lock SET locked_until = TIMESTAMPTZ 'epoch', holder_id = NULL
  WHERE id = 1 AND (holder_id IS NOT DISTINCT FROM p_holder_id OR locked_until < now());
END;
$$;
REVOKE ALL ON FUNCTION public.acquire_sheet_preview_lock(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_sheet_preview_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_sheet_preview_lock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sheet_preview_lock(uuid) TO service_role;
