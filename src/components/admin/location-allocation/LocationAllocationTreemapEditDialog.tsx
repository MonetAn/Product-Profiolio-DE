import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { LocationAllocationHierarchicalGeoEditor } from '@/components/admin/location-allocation/LocationAllocationHierarchicalGeoEditor';
import {
  expandSplitToCountryEntries,
  geoSplitPercentTotalForCatalog,
  normalizeGeoSplitEntries,
  scopeLabelForLevel,
  type LocationAllocationGeoEditTarget,
} from '@/lib/locationAllocationGeoEdit';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LocationAllocationGeoEditTarget | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
};

function normalizeGeoSplit(split: GeoCostSplit | undefined): GeoCostSplit | undefined {
  if (!split?.entries?.length) return undefined;
  const entries = normalizeGeoSplitEntries(split.entries);
  return entries.length > 0 ? { entries } : undefined;
}

function geoSplitsEqual(a: GeoCostSplit | undefined, b: GeoCostSplit | undefined): boolean {
  return JSON.stringify(normalizeGeoSplit(a)) === JSON.stringify(normalizeGeoSplit(b));
}

export function LocationAllocationTreemapEditDialog({
  open,
  onOpenChange,
  target,
  countries,
  countryIdToClusterKey,
  onGeoCostSplitSave,
}: Props) {
  const { toast } = useToast();
  const [draftSplit, setDraftSplit] = useState<GeoCostSplit | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const savedSplit = useMemo(() => {
    if (!target) return undefined;
    return normalizeGeoSplit(
      expandSplitToCountryEntries(
        target.initialSplit,
        countries,
        countryIdToClusterKey
      ).length > 0
        ? {
            entries: expandSplitToCountryEntries(
              target.initialSplit,
              countries,
              countryIdToClusterKey
            ),
          }
        : target.initialSplit
    );
  }, [target, countries, countryIdToClusterKey]);

  useEffect(() => {
    if (!open || !target) return;
    setDraftSplit(savedSplit);
  }, [open, target, savedSplit]);

  const isDirty = !geoSplitsEqual(draftSplit, savedSplit);
  const totalPct = geoSplitPercentTotalForCatalog(draftSplit, countries);

  const requestClose = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      if (isDirty) {
        setDiscardOpen(true);
        return;
      }
      onOpenChange(false);
    },
    [isDirty, onOpenChange]
  );

  const handleSave = async () => {
    if (!target || !isDirty || isSaving) return;
    if (totalPct !== 100) {
      toast({
        title: 'Сумма должна быть 100%',
        description: 'Отрегулируйте доли по рынкам, кластерам или регионам.',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeGeoSplit(draftSplit);
    setIsSaving(true);
    try {
      await Promise.all(
        target.initiativeIds.map((id) => onGeoCostSplitSave(id, normalized))
      );
      toast({
        title: 'Сохранено',
        description:
          target.level === 'initiative'
            ? 'Распределение по рынкам обновлено.'
            : `Распределение применено к ${target.initiativeIds.length} инициативам.`,
      });
      onOpenChange(false);
    } catch {
      toast({
        title: 'Не удалось сохранить',
        description: 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!target) return null;

  const scopeHint =
    target.level === 'initiative'
      ? 'Изменения только для этой инициативы.'
      : `Изменения применятся ко всем ${target.initiativeIds.length} инициативам внутри ${scopeLabelForLevel(target.level)}.`;

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="flex max-h-[min(92dvh,880px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 text-left">
            <p className="text-xs text-muted-foreground">{target.breadcrumb}</p>
            <DialogTitle className="text-lg leading-snug">{target.title}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
            {target.description ? (
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {target.description}
              </p>
            ) : target.level === 'initiative' ? (
              <p className="mb-3 text-sm text-muted-foreground italic">Описание не указано</p>
            ) : null}
            <p className="mb-1 text-xs text-muted-foreground">{scopeHint}</p>
            {target.totalCostRub > 0 ? (
              <p className="mb-4 text-sm tabular-nums">
                <span className="text-muted-foreground">Полная стоимость за год: </span>
                <span className="font-semibold">{formatLocationCompactM(target.totalCostRub)}</span>
              </p>
            ) : (
              <div className="mb-4" />
            )}

            <LocationAllocationHierarchicalGeoEditor
              split={draftSplit}
              totalCostRub={target.totalCostRub}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              onChange={setDraftSplit}
              disabled={isSaving}
            />
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3 sm:justify-between">
            <p className="text-[11px] text-muted-foreground self-center">
              {isDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
              {totalPct !== 100 ? ` · Σ ${totalPct}%` : null}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => requestClose(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isDirty || isSaving || totalPct !== 100}
                onClick={() => void handleSave()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              Изменения распределения по рынкам не будут сохранены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Остаться</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDiscardOpen(false);
                setDraftSplit(savedSplit);
                onOpenChange(false);
              }}
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
