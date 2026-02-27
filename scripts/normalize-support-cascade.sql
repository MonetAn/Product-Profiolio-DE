-- One-time: normalize support cascade in initiatives.quarterly_data
-- Rule: if any quarter has support = true, set support = true for that quarter and all following (by key order).
--
-- Run in Supabase Dashboard → SQL Editor (runs with project privileges, no RLS issue).

CREATE OR REPLACE FUNCTION normalize_quarterly_support(j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  q text;
  quarters text[];
  first_idx int := -1;
  i int;
  out_val jsonb;
  result jsonb := '{}'::jsonb;
BEGIN
  IF j IS NULL OR jsonb_typeof(j) != 'object' THEN
    RETURN j;
  END IF;

  SELECT array_agg(key ORDER BY key)
  INTO quarters
  FROM jsonb_object_keys(j) AS key;

  IF quarters IS NULL THEN
    RETURN j;
  END IF;

  FOR i IN 1..array_length(quarters, 1) LOOP
    IF (j->quarters[i]->>'support')::boolean = true THEN
      first_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF first_idx = -1 THEN
    RETURN j;
  END IF;

  FOR i IN 1..array_length(quarters, 1) LOOP
    q := quarters[i];
    out_val := j->q;
    IF i >= first_idx THEN
      out_val := jsonb_set(COALESCE(out_val, '{}'::jsonb), '{support}', 'true'::jsonb, true);
    END IF;
    result := result || jsonb_build_object(q, out_val);
  END LOOP;

  RETURN result;
END;
$$;

-- Update only rows where normalization changes something
WITH updated AS (
  UPDATE public.initiatives i
  SET quarterly_data = normalize_quarterly_support(i.quarterly_data)
  WHERE normalize_quarterly_support(i.quarterly_data) IS DISTINCT FROM i.quarterly_data
  RETURNING id, initiative
)
SELECT count(*) AS "Updated initiatives" FROM updated;

-- Optional: drop the function if you don't want it left in the DB
-- DROP FUNCTION IF EXISTS normalize_quarterly_support(jsonb);
