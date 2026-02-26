-- Add UNIQUE constraint to external_id for upsert operations
ALTER TABLE public.people 
ADD CONSTRAINT people_external_id_unique UNIQUE (external_id);