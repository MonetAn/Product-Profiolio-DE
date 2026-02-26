-- 1. Функция проверки домена @dodobrands.io
CREATE OR REPLACE FUNCTION public.is_dodo_employee()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() ->> 'email') LIKE '%@dodobrands.io',
      false
    )
  );
END;
$$;

-- 2. Таблица profiles (профили пользователей)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Таблица initiatives (инициативы)
CREATE TABLE public.initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit TEXT NOT NULL,
  team TEXT NOT NULL,
  initiative TEXT NOT NULL,
  initiative_type TEXT CHECK (initiative_type IN ('Product', 'Stream', 'Enabler', '')),
  stakeholders_list TEXT[] DEFAULT '{}',
  description TEXT DEFAULT '',
  documentation_link TEXT DEFAULT '',
  stakeholders TEXT DEFAULT '',
  quarterly_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

-- Индексы для производительности
CREATE INDEX idx_initiatives_unit ON public.initiatives(unit);
CREATE INDEX idx_initiatives_team ON public.initiatives(team);
CREATE INDEX idx_initiatives_unit_team ON public.initiatives(unit, team);

-- 4. Таблица initiative_history (аудит изменений)
CREATE TABLE public.initiative_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID REFERENCES public.initiatives(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  field_name TEXT,
  old_value JSONB,
  new_value JSONB
);

ALTER TABLE public.initiative_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_history_initiative ON public.initiative_history(initiative_id);
CREATE INDEX idx_history_changed_at ON public.initiative_history(changed_at DESC);

-- 5. RLS политики для profiles
CREATE POLICY "Dodo employees can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_dodo_employee());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- 6. RLS политики для initiatives
CREATE POLICY "Dodo employees can view initiatives"
ON public.initiatives FOR SELECT
TO authenticated
USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can create initiatives"
ON public.initiatives FOR INSERT
TO authenticated
WITH CHECK (public.is_dodo_employee());

CREATE POLICY "Dodo employees can update initiatives"
ON public.initiatives FOR UPDATE
TO authenticated
USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can delete initiatives"
ON public.initiatives FOR DELETE
TO authenticated
USING (public.is_dodo_employee());

-- 7. RLS политики для initiative_history
CREATE POLICY "Dodo employees can view history"
ON public.initiative_history FOR SELECT
TO authenticated
USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can insert history"
ON public.initiative_history FOR INSERT
TO authenticated
WITH CHECK (public.is_dodo_employee());

-- 8. Триггер автообновления updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_initiatives_updated_at
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 9. Триггер автосоздания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();