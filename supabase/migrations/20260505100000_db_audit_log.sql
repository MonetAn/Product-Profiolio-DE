-- Универсальный audit log на ключевые таблицы.
-- Пишет каждое INSERT/UPDATE/DELETE в public.db_audit_log с указанием
-- кто (email/uid из JWT), когда (changed_at), что (полный snapshot OLD/NEW + diff
-- только изменённых полей для UPDATE).
--
-- Цель: после открытия доступа всем — за минуту находить «кто что сломал».
-- Бэкап даёт «откатить целиком», audit log даёт «увидеть и точечно исправить».

CREATE TABLE IF NOT EXISTS public.db_audit_log (
  id                 BIGSERIAL PRIMARY KEY,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  txid               BIGINT      NOT NULL DEFAULT txid_current(),
  changed_by_email   TEXT,
  changed_by_user_id UUID,
  source_table       TEXT NOT NULL,
  op                 TEXT NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
  row_pk             JSONB,
  old_data           JSONB,
  new_data           JSONB,
  diff               JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON public.db_audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_changed_at
  ON public.db_audit_log (source_table, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_email_changed_at
  ON public.db_audit_log (changed_by_email, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_txid
  ON public.db_audit_log (txid);

COMMENT ON TABLE  public.db_audit_log IS 'Аудит изменений критичных таблиц. Чтение доступно только super_admin (RLS).';
COMMENT ON COLUMN public.db_audit_log.txid IS 'Идентификатор транзакции — позволяет сгруппировать все строки одной операции.';
COMMENT ON COLUMN public.db_audit_log.diff IS 'Только изменённые поля для UPDATE: {key: {old, new}}.';
COMMENT ON COLUMN public.db_audit_log.row_pk IS 'PK строки в формате JSONB. Состав ключей зависит от таблицы (см. триггеры).';

-- Универсальная триггер-функция.
-- TG_ARGV содержит имена PK-колонок (одно или несколько).
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
  -- 1. Кто сделал. Не падаем, если контекст без JWT (системные SQL, миграции).
  BEGIN v_email := auth.email(); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN v_uid   := auth.uid();   EXCEPTION WHEN OTHERS THEN v_uid   := NULL; END;

  -- 2. Snapshot до и после
  IF (TG_OP IN ('UPDATE','DELETE')) THEN v_old_data := to_jsonb(OLD); END IF;
  IF (TG_OP IN ('UPDATE','INSERT')) THEN v_new_data := to_jsonb(NEW); END IF;

  -- 3. PK строки
  IF (TG_OP = 'DELETE') THEN
    SELECT jsonb_object_agg(k, v_old_data->k) INTO v_pk FROM unnest(v_pk_cols) AS k;
  ELSE
    SELECT jsonb_object_agg(k, v_new_data->k) INTO v_pk FROM unnest(v_pk_cols) AS k;
  END IF;

  -- 4. Diff только для UPDATE — только реально изменённые поля
  IF (TG_OP = 'UPDATE') THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', v_old_data->key, 'new', value))
      INTO v_diff
      FROM jsonb_each(v_new_data)
     WHERE v_old_data->key IS DISTINCT FROM value;
  END IF;

  INSERT INTO public.db_audit_log
    (source_table, op, row_pk, old_data, new_data, diff, changed_by_email, changed_by_user_id)
  VALUES
    (TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP, v_pk, v_old_data, v_new_data, v_diff, v_email, v_uid);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.audit_trigger_func IS 'Триггер аудита. Аргументы — имена PK-колонок таблицы.';

-- Триггеры на 4 ключевые таблицы. На разные операции навешиваем один и тот же
-- AFTER FOR EACH ROW.
DROP TRIGGER IF EXISTS initiatives_audit_trg ON public.initiatives;
CREATE TRIGGER initiatives_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('id');

DROP TRIGGER IF EXISTS initiative_budget_department_2026_audit_trg ON public.initiative_budget_department_2026;
CREATE TRIGGER initiative_budget_department_2026_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.initiative_budget_department_2026
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('initiative_id', 'budget_department');

DROP TRIGGER IF EXISTS people_audit_trg ON public.people;
CREATE TRIGGER people_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('id');

DROP TRIGGER IF EXISTS team_quarter_snapshots_audit_trg ON public.team_quarter_snapshots;
CREATE TRIGGER team_quarter_snapshots_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.team_quarter_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('id');

-- RLS: читать audit log может только super_admin.
ALTER TABLE public.db_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_super_admin_select" ON public.db_audit_log;
CREATE POLICY "audit_log_super_admin_select" ON public.db_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.allowed_users
       WHERE email = auth.email() AND role = 'super_admin'
    )
  );

-- INSERT в audit_log приложение делать не должно. Триггеры пишут через
-- SECURITY DEFINER и обходят RLS. UPDATE/DELETE/TRUNCATE из UI запрещены —
-- политик нет, RLS блокирует по умолчанию.

-- Утилита: автоматическая чистка записей старше N дней. Запускать вручную или
-- через pg_cron, если он будет включён.
CREATE OR REPLACE FUNCTION public.prune_audit_log(p_days INTEGER DEFAULT 60)
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.db_audit_log WHERE changed_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.prune_audit_log IS 'Удаляет записи db_audit_log старше N дней (по умолчанию 60).';
