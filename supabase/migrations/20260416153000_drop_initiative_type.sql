-- Тип инициативы больше не используется в продукте
ALTER TABLE public.initiatives DROP COLUMN IF EXISTS initiative_type;
