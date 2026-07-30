-- Все редактируемые поля карточки команды сохраняются одной транзакцией.
-- Так промежуточные проценты и описания не становятся видимыми по частям.

CREATE OR REPLACE FUNCTION public.save_allocation_scenario_team_card(
  p_team_id uuid,
  p_description text,
  p_run_percent numeric,
  p_run_description text,
  p_regions jsonb,
  p_updated_by_name text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  region_item jsonb;
  region_name text;
  region_percent numeric;
  region_description text;
  region_sort_order integer;
BEGIN
  IF p_run_percent < 0 OR p_run_percent > 100 THEN
    RAISE EXCEPTION 'RUN percent must be between 0 and 100'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_regions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Regions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_regions) <> 4 THEN
    RAISE EXCEPTION 'Exactly four allocation areas are required'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT item ->> 'region')
    FROM jsonb_array_elements(p_regions) item
    WHERE item ->> 'region' IN (
      'Domestic Region',
      'International Region',
      'Drink It',
      'Platform'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'Allocation areas must be unique and supported'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.location_allocation_scenario_teams
  SET
    description = COALESCE(p_description, ''),
    run_percent = p_run_percent,
    run_description = COALESCE(p_run_description, ''),
    updated_by = auth.uid(),
    updated_by_name = COALESCE(p_updated_by_name, ''),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation scenario team not found or unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  FOR region_item IN
    SELECT value
    FROM jsonb_array_elements(p_regions)
  LOOP
    region_name := region_item ->> 'region';
    region_percent := (region_item ->> 'percent')::numeric;
    region_description := COALESCE(region_item ->> 'description', '');
    region_sort_order := COALESCE(
      (region_item ->> 'sort_order')::integer,
      0
    );

    IF region_percent < 0 OR region_percent > 100 THEN
      RAISE EXCEPTION 'Allocation percent must be between 0 and 100'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.location_allocation_scenario_regions (
      team_id,
      region,
      percent,
      description,
      sort_order,
      created_by,
      updated_by,
      updated_by_name,
      updated_at
    )
    VALUES (
      p_team_id,
      region_name,
      region_percent,
      region_description,
      region_sort_order,
      auth.uid(),
      auth.uid(),
      COALESCE(p_updated_by_name, ''),
      timezone('utc'::text, now())
    )
    ON CONFLICT (team_id, region) DO UPDATE
    SET
      percent = EXCLUDED.percent,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      updated_by = EXCLUDED.updated_by,
      updated_by_name = EXCLUDED.updated_by_name,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

REVOKE ALL
  ON FUNCTION public.save_allocation_scenario_team_card(
    uuid,
    text,
    numeric,
    text,
    jsonb,
    text
  )
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.save_allocation_scenario_team_card(
    uuid,
    text,
    numeric,
    text,
    jsonb,
    text
  )
  TO authenticated;
