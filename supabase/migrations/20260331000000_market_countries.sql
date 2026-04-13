-- Справочник стран для распределения стоимости по кластерам/рынкам.
-- Чтение: все с доступом к админке; запись: только admin.

CREATE TABLE IF NOT EXISTS public.market_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL,
  label_ru text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_countries_cluster ON public.market_countries (cluster_key);
CREATE INDEX IF NOT EXISTS idx_market_countries_active_sort ON public.market_countries (is_active, sort_order);

ALTER TABLE public.market_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_countries_select_authenticated"
  ON public.market_countries FOR SELECT TO authenticated
  USING (public.current_user_has_access());

CREATE POLICY "market_countries_insert_admin"
  ON public.market_countries FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "market_countries_update_admin"
  ON public.market_countries FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "market_countries_delete_admin"
  ON public.market_countries FOR DELETE TO authenticated
  USING (public.current_user_is_admin());

-- Сид: кластеры и страны (ОАЭ; без «Новые рынки»).
INSERT INTO public.market_countries (cluster_key, label_ru, sort_order) VALUES
  ('Russia', 'Россия', 10),
  ('Central Asia', 'Казахстан', 20),
  ('Central Asia', 'Узбекистан', 21),
  ('MENA', 'ОАЭ', 30),
  ('MENA', 'Катар', 31),
  ('MENA', 'Ирак', 32),
  ('MENA', 'Морокко', 33),
  ('Turkey', 'Турция', 40),
  ('Europe', 'Литва', 50),
  ('Europe', 'Эстония', 51),
  ('Europe', 'Румыния', 52),
  ('Europe', 'Словения', 53),
  ('Europe', 'Польша', 54),
  ('Europe', 'Сербия', 55),
  ('Europe', 'Кипр', 56),
  ('Europe', 'Хорватия', 57),
  ('Europe', 'Болгария', 58),
  ('Europe', 'Монтенегро', 59),
  ('Europe', 'Молдова', 60),
  ('Europe', 'Испания', 61),
  ('Europe', 'Беларусь', 62),
  ('Other_Countries', 'Таджикистан', 70),
  ('Other_Countries', 'Грузия', 71),
  ('Other_Countries', 'Азербайджан', 72),
  ('Other_Countries', 'Нигерия', 73),
  ('Other_Countries', 'Кыргызстан', 74),
  ('Other_Countries', 'Армения', 75),
  ('Other_Countries', 'Индонезия', 76);
