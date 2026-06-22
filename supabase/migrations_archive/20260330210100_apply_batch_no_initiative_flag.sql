-- RPC только обновляет quarterly_data (флаг подтверждения внутри JSON кварталов)
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

COMMENT ON FUNCTION public.apply_initiatives_quarterly_data_batch(jsonb) IS
  'Batch replace initiatives.quarterly_data. Edge sheets-pull-out.';
