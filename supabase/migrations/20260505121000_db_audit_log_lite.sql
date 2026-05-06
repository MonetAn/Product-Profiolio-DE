-- Облегчённая версия audit log: только метаданные + diff (для UPDATE).
-- Убираем old_data и new_data — это были полные snapshots, основной источник
-- объёма. Восстановление точечных значений теперь делается из бэкапов
-- (каждые 6 часов, сейчас + ежечасные на сутки после открытия доступа).
--
-- Что остаётся в логе:
--   • кто (changed_by_email, changed_by_user_id)
--   • когда (changed_at, txid)
--   • что (source_table, op, row_pk)
--   • для UPDATE — diff: { field: { old, new } } только изменённые поля
--
-- Это даёт ответы на вопросы "кто удалил X / поменял поле Y" с лёгкой
-- payload (~150-300 байт против 1.2 KB).

-- 1) Удаляем тяжёлые колонки. Существующие записи теряют snapshots —
-- это нормально, audit log не считается источником правды для восстановления.
ALTER TABLE public.db_audit_log DROP COLUMN IF EXISTS old_data;
ALTER TABLE public.db_audit_log DROP COLUMN IF EXISTS new_data;

-- 2) Перепишем триггер-функцию без записи snapshots
CREATE OR REPLACE FUNCTION public.audit_trigger_func() RETURNS trigger AS $$
DECLARE
  v_pk_cols TEXT[] := TG_ARGV::text[];
  v_old_data JSONB;
  v_new_data JSONB;
  v_pk JSONB;
  v_email TEXT;
  v_uid UUID;
  v_diff JSONB;
BEGIN
  BEGIN v_email := auth.email(); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN v_uid   := auth.uid();   EXCEPTION WHEN OTHERS THEN v_uid   := NULL; END;

  IF (TG_OP IN ('UPDATE','DELETE')) THEN v_old_data := to_jsonb(OLD); END IF;
  IF (TG_OP IN ('UPDATE','INSERT')) THEN v_new_data := to_jsonb(NEW); END IF;

  IF (TG_OP = 'DELETE') THEN
    SELECT jsonb_object_agg(k, v_old_data->k) INTO v_pk FROM unnest(v_pk_cols) AS k;
  ELSE
    SELECT jsonb_object_agg(k, v_new_data->k) INTO v_pk FROM unnest(v_pk_cols) AS k;
  END IF;

  -- Для UPDATE — собираем только реально изменённые поля
  IF (TG_OP = 'UPDATE') THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', v_old_data->key, 'new', value))
      INTO v_diff
      FROM jsonb_each(v_new_data)
     WHERE v_old_data->key IS DISTINCT FROM value;

    -- Если ни одно поле не поменялось (no-op UPDATE) — не пишем в лог вообще
    IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO public.db_audit_log
    (source_table, op, row_pk, diff, changed_by_email, changed_by_user_id)
  VALUES
    (TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP, v_pk, v_diff, v_email, v_uid);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.audit_trigger_func IS
  'Lite audit: метаданные + diff (только UPDATE). Snapshots не пишутся, восстановление из бэкапов.';

-- 3) Обновим prune_audit_log: дефолт 14 дней, не 60.
CREATE OR REPLACE FUNCTION public.prune_audit_log(p_days INTEGER DEFAULT 14)
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.db_audit_log WHERE changed_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4) Сразу подчистим то, что уже накопилось дольше 14 дней (на старте — ничего)
SELECT public.prune_audit_log(14);

-- 5) VACUUM ANALYZE — освободить место от удалённых колонок и записей
-- (vacuum нельзя в транзакции, но эта миграция применяется в одной транзакции,
-- так что VACUUM запустим отдельно после миграции через psql).
