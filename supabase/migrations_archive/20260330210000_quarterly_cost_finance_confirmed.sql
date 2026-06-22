-- Перенос подтверждения финансами с инициативы на кварталы в quarterly_data
DO $$
DECLARE
  r RECORD;
  new_qd jsonb;
  rk text;
  qobj jsonb;
  v boolean;
BEGIN
  FOR r IN SELECT id, quarterly_data, cost_finance_confirmed FROM public.initiatives LOOP
    v := COALESCE(r.cost_finance_confirmed, true);
    new_qd := COALESCE(r.quarterly_data, '{}'::jsonb);
    IF jsonb_typeof(new_qd) <> 'object' THEN
      new_qd := '{}'::jsonb;
    END IF;

    FOR rk IN SELECT jsonb_object_keys(new_qd) AS k LOOP
      IF rk ~ '^\d{4}-Q[1-4]$' THEN
        qobj := new_qd -> rk;
        IF jsonb_typeof(qobj) = 'object' THEN
          new_qd := jsonb_set(
            new_qd,
            ARRAY[rk],
            (qobj || jsonb_build_object('costFinanceConfirmed', to_jsonb(v)))
          );
        END IF;
      END IF;
    END LOOP;

    UPDATE public.initiatives SET quarterly_data = new_qd WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.initiatives DROP COLUMN IF EXISTS cost_finance_confirmed;

COMMENT ON TABLE public.initiatives IS
  'costFinanceConfirmed по кварталу: quarterly_data["YYYY-Qn"].costFinanceConfirmed (false = предварительно после Quick Flow).';
