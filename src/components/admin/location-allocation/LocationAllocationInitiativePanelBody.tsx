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
import { normalizeInitiativeTags, type InitiativeTag } from '@/lib/initiativeTags';
import { InitiativeAllocationComments } from '@/components/admin/location-allocation/InitiativeAllocationComments';
import { LocationAllocationQuarterPlanFact } from '@/components/admin/location-allocation/LocationAllocationQuarterPlanFact';
import { LocationAllocationGeoReadSummary } from '@/components/admin/location-allocation/LocationAllocationGeoReadSummary';

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
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  closeGuardRef?: React.MutableRefObject<LocationAllocationPanelCloseGuard | null>;
  readOnly?: boolean;
};

function normalizeGeoSplit(split: GeoCostSplit | undefined): GeoCostSplit | undefined {
  if (!split?.entries?.length) return undefined;
  return {
    entries: split.entries.map((e) => ({ ...e })),
    ...(split.note?.trim() ? { note: split.note.trim() } : {}),
    ...(split.allocationOrigin ? { allocationOrigin: split.allocationOrigin } : {}),
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
  onInitiativeTagsSave,
  closeGuardRef,
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const [draftSplit, setDraftSplit] = useState<GeoCostSplit | undefined>(
    initiative.initiativeGeoCostSplit
  );
  const [isSaving, setIsSaving] = useState(false);
  const [draftTags, setDraftTags] = useState<InitiativeTag[]>(
    normalizeInitiativeTags(initiative.tags)
  );
  const [discardOpen, setDiscardOpen] = useState(false);
  const [coefficientConfirmOpen, setCoefficientConfirmOpen] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const initiativeIdRef = useRef(initiative.id);

  const savedSplit = initiative.initiativeGeoCostSplit;
  const savedTags = normalizeInitiativeTags(initiative.tags);
  const geoDirty = !geoSplitsEqual(draftSplit, savedSplit);
  const tagsDirty = JSON.stringify(draftTags) !== JSON.stringify(savedTags);
  const isDirty = !readOnly && (geoDirty || tagsDirty);

  useEffect(() => {
    if (initiativeIdRef.current !== initiative.id) {
      initiativeIdRef.current = initiative.id;
      setDraftSplit(initiative.initiativeGeoCostSplit);
      setDraftTags(normalizeInitiativeTags(initiative.tags));
      return;
    }
    if (!isDirty) {
      setDraftSplit(initiative.initiativeGeoCostSplit);
      setDraftTags(normalizeInitiativeTags(initiative.tags));
    }
  }, [initiative.id, initiative.initiativeGeoCostSplit, initiative.tags, isDirty]);

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
    setDraftTags(savedTags);
    proceed?.();
  };

  const performSave = async () => {
    if (readOnly || !isDirty || isSaving) return;
    const normalizedDraft = normalizeGeoSplit(draftSplit);
    const normalized = normalizedDraft
      ? {
          ...normalizedDraft,
          allocationOrigin: {
            level: 'initiative' as const,
            initiativeId: initiative.id,
          },
        }
      : undefined;
    setIsSaving(true);
    try {
      await Promise.all([
        ...(geoDirty ? [onGeoCostSplitSave(initiative.id, normalized)] : []),
        ...(tagsDirty ? [onInitiativeTagsSave(initiative.id, draftTags)] : []),
      ]);
      toast({
        title: 'Сохранено',
        description:
          geoDirty && tagsDirty
            ? 'Распределение по рынкам и теги обновлены.'
            : tagsDirty
              ? 'Теги инициативы обновлены.'
              : 'Распределение по рынкам обновлено.',
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

          {!readOnly ? (
            <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 p-3">
              <InitiativeAllocationComments
                scope={{ type: 'initiative', initiativeId: initiative.id }}
                legacyNote={savedSplit?.note}
                compact
              />
              {savedSplit?.allocationOrigin?.level === 'team' ? (
                <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                  Коэффициенты получены от команды «{savedSplit.allocationOrigin.team}». Сохранение создаст отдельное решение для инициативы.
                </p>
              ) : savedSplit?.allocationOrigin?.level === 'unit' ? (
                <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                  Коэффициенты получены от юнита «{savedSplit.allocationOrigin.unit}». Сохранение создаст отдельное решение для инициативы.
                </p>
              ) : null}
            </div>
          ) : null}

          {initiative.description?.trim() ? (
            <div className="mb-4 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Описание
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {initiative.description}
              </p>
            </div>
          ) : null}

          <LocationAllocationQuarterPlanFact
            initiative={initiative}
            quarters={yearQuarters}
          />

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

          {readOnly && yearCost > 0 ? (
            <div className="border-t border-border/60 pb-4 pt-4">
              <LocationAllocationGeoReadSummary
                split={savedSplit}
                totalCostRub={yearCost}
                countries={countries}
                countryIdToClusterKey={countryIdToClusterKey}
              />
            </div>
          ) : yearCost > 0 && marketCountriesGeo.length > 0 ? (
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

        {!readOnly ? (
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
              onClick={() => {
                if (geoDirty) {
                  setCoefficientConfirmOpen(true);
                } else {
                  void performSave();
                }
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Сохранение…
                </>
              ) : (
                geoDirty ? 'Заменить коэффициенты' : 'Сохранить'
              )}
            </Button>
          </div>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={coefficientConfirmOpen}
        onOpenChange={setCoefficientConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Заменить коэффициенты?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущее распределение по регионам и рынкам будет заменено. История
              комментариев останется без изменений.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                setCoefficientConfirmOpen(false);
                void performSave();
              }}
            >
              Заменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              Изменения распределения по рынкам и тегов не будут сохранены. Добавленные комментарии уже находятся в истории.
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
