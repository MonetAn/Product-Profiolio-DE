-- Add flag for timeline stub initiatives (show at bottom of timeline)
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS is_timeline_stub BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.initiatives.is_timeline_stub IS 'When true, initiative is shown at the bottom of the timeline (placeholder for quarters where initiatives were not specified).';

-- Backfill: mark as stub where initiative name contains "ФОТ" or equals "Дизайн + UX ресерчер"
UPDATE public.initiatives
SET is_timeline_stub = true
WHERE (trim(initiative) ILIKE '%ФОТ%' OR trim(initiative) = 'Дизайн + UX ресерчер')
  AND (is_timeline_stub IS NOT true);
