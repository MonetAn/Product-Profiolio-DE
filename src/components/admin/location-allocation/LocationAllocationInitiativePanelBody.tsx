import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
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
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { initiativeYearCostRub } from '@/lib/locationAllocationModel';
import {
  initiativeFactByAllRegions,
  TOP_REGION_DISPLAY_LABELS,
  TOP_REGION_ORDER,
} from '@/lib/locationRegionModel';

export type LocationAllocationPanelCloseGuard = {
  hasUnsavedChanges: () => boolean;
  confirmDiscard: (onProceed: () => void) => void;
};

type Props = {
  initiative: AdminDataRow;
  yearQuarters: string[];
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  closeGuardRef?: React.MutableRefObject<LocationAllocationPanelCloseGuard | null>;
};

function normalizeGeoSplit(split: GeoCostSplit | undefined): GeoCostSplit | undefined {
  if (!split?.entries?.length) return undefined;
  return {
    entries: split.entries.map((e) => ({ ...e })),
    ...(split.note?.trim() ? { note: split.note.trim() } : {}),
  };
}

function geoSplitsEqual(a: GeoCostSplit | undefined, b: GeoCostSplit | undefined): boolean {
  return JSON.stringify(normalizeGeoSplit(a)) === JSON.stringify(normalizeGeoSplit(b));
}

export function LocationAllocationInitiativePanelBody({
  initiative,
  yearQuarters,
  countries,
  countryIdToClusterKey,
  onGeoCostSplitSave,
  closeGuardRef,
}: Props) {
  const { toast } = useToast();
  const [draftSplit, setDraftSplit] = useState<GeoCostSplit | undefined>(
    initiative.initiativeGeoCostSplit
  );
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);

  const savedSplit = initiative.initiativeGeoCostSplit;
  const isDirty = !geoSplitsEqual(draftSplit, savedSplit);

  useEffect(() => {
    setDraftSplit(initiative.initiativeGeoCostSplit);
  }, [initiative.id]);

  useEffect(() => {
    if (!isDirty) {
      setDraftSplit(initiative.initiativeGeoCostSplit);
    }
  }, [initiative.initiativeGeoCostSplit, isDirty]);

  const confirmDiscard = useCallback((onProceed: () => void) => {
    pendingCloseRef.current = onProceed;
    setDiscardOpen(true);
  }, []);

  useEffect(() => {
    if (!closeGuardRef) return;
    closeGuardRef.current = {
      hasUnsavedChanges: () => isDirty,
      confirmDiscard,
    };
    return () => {
      closeGuardRef.current = null;
    };
  }, [closeGuardRef, isDirty, confirmDiscard]);

  const handleDiscard = () => {
    setDiscardOpen(false);
    const proceed = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setDraftSplit(savedSplit);
    proceed?.();
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    const normalized = normalizeGeoSplit(draftSplit);
    setIsSaving(true);
    try {
      await onGeoCostSplitSave(initiative.id, normalized);
      toast({
        title: 'Сохранено',
        description: 'Распределение по рынкам обновлено.',
      });
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

  const yearCost = initiativeYearCostRub(initiative, yearQuarters);
  const marketCountriesGeo = useMemo(
    () => countries.filter((c) => c.is_active),
    [countries]
  );

  const previewInitiative = useMemo(
    () => ({ ...initiative, initiativeGeoCostSplit: draftSplit }),
    [initiative, draftSplit]
  );

  const regionBreakdown = useMemo(
    () =>
      initiativeFactByAllRegions(
        previewInitiative,
        yearQuarters,
        countries,
        countryIdToClusterKey
      ),
    [previewInitiative, yearQuarters, countries, countryIdToClusterKey]
  );

  const regionTotalRub = useMemo(
    () => [...regionBreakdown.values()].reduce((s, v) => s + v, 0),
    [regionBreakdown]
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3">
          <div className="gantt-detail-panel-meta">
            {initiative.unit} › {initiative.team || 'Без команды'}
          </div>

          {yearCost > 0 ? (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Аллокации по регионам
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  всего {formatLocationCompactM(yearCost)}
                </span>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/25 p-2.5 space-y-1.5">
                {TOP_REGION_ORDER.map((region) => {
                  const rub = regionBreakdown.get(region) ?? 0;
                  const pct = regionTotalRub > 0 ? (rub / regionTotalRub) * 100 : 0;
                  return (
                    <div
                      key={region}
                      className="flex items-center justify-between gap-2 text-xs leading-snug"
                    >
                      <span className="min-w-0 truncate text-foreground/90">
                        {TOP_REGION_DISPLAY_LABELS[region]}
                      </span>
                      <span className="shrink-0 tabular-nums text-right">
                        <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
                        <span className="ml-2 text-muted-foreground">
                          {formatLocationCompactM(rub)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] leading-snug text-muted-foreground">
                {isDirty
                  ? 'Предпросмотр по черновику · сохраните, чтобы применить'
                  : 'Суммарное распределение за год · только для просмотра'}
              </p>
            </div>
          ) : null}

          {yearCost > 0 && marketCountriesGeo.length > 0 ? (
            <div className="space-y-2 border-t border-border/60 pt-4 pb-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Распределение по рынкам
              </div>
              <GeoCostSplitEditor
                cost={Math.round(yearCost)}
                value={draftSplit}
                countries={marketCountriesGeo}
                onChange={setDraftSplit}
                hideDrivers
                lockMarketSelection
                showQuarterNote={false}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-4 py-3 shadow-[0_-6px_16px_hsl(var(--background)/0.65)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground leading-snug">
              {isDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
            </p>
            <Button
              type="button"
              size="sm"
              className="min-w-[7.5rem]"
              disabled={!isDirty || isSaving}
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
        </div>
      </div>

      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDiscardOpen(false);
            pendingCloseRef.current = null;
          }
        }}
      >
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
              onClick={handleDiscard}
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
