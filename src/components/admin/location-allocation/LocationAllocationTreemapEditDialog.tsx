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
  type LocationAllocationGeoEditTarget,
} from '@/lib/locationAllocationGeoEdit';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { normalizeInitiativeTags, type InitiativeTag } from '@/lib/initiativeTags';
import { InitiativeAllocationComments } from '@/components/admin/location-allocation/InitiativeAllocationComments';
import { LocationAllocationGeoReadSummary } from '@/components/admin/location-allocation/LocationAllocationGeoReadSummary';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LocationAllocationGeoEditTarget | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  focusedCommentId?: string | null;
  readOnly?: boolean;
};

function normalizeGeoSplit(split: GeoCostSplit | undefined): GeoCostSplit | undefined {
  if (!split?.entries?.length) return undefined;
  const entries = normalizeGeoSplitEntries(split.entries);
  const note = split.note?.trim();
  return entries.length > 0
    ? {
        entries,
        ...(note ? { note } : {}),
        ...(split.allocationOrigin ? { allocationOrigin: split.allocationOrigin } : {}),
      }
    : undefined;
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
  onInitiativeTagsSave,
  focusedCommentId = null,
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const [draftSplit, setDraftSplit] = useState<GeoCostSplit | undefined>(undefined);
  const [draftTags, setDraftTags] = useState<InitiativeTag[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardDestination, setDiscardDestination] = useState<'close' | 'read'>(
    'close'
  );
  const [coefficientConfirmOpen, setCoefficientConfirmOpen] = useState(false);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [savedSplit, setSavedSplit] = useState<GeoCostSplit | undefined>(
    undefined
  );

  const initialSavedSplit = useMemo(() => {
    if (!target) return undefined;
    const expandedEntries = expandSplitToCountryEntries(
      target.initialSplit,
      countries,
      countryIdToClusterKey
    );
    return normalizeGeoSplit(
      expandedEntries.length > 0
        ? { ...target.initialSplit, entries: expandedEntries }
        : target.initialSplit
    );
  }, [target, countries, countryIdToClusterKey]);

  const savedTags = useMemo(
    () =>
      target?.level === 'initiative'
        ? normalizeInitiativeTags(target.initiatives[0]?.tags)
        : [],
    [target]
  );

  useEffect(() => {
    if (!open || !target) return;
    setSavedSplit(initialSavedSplit);
    setDraftSplit(initialSavedSplit);
    setDraftTags(savedTags);
    setMode('read');
    setDiscardOpen(false);
    setCoefficientConfirmOpen(false);
  }, [open, target, initialSavedSplit, savedTags]);

  const geoDirty = !geoSplitsEqual(draftSplit, savedSplit);
  const tagsDirty = JSON.stringify(draftTags) !== JSON.stringify(savedTags);
  const isDirty = geoDirty || tagsDirty;
  const totalPct = geoSplitPercentTotalForCatalog(draftSplit, countries);

  const requestClose = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      if (isDirty) {
        setDiscardDestination('close');
        setDiscardOpen(true);
        return;
      }
      onOpenChange(false);
    },
    [isDirty, onOpenChange]
  );

  const handleSave = async () => {
    if (readOnly || !target || !isDirty || isSaving) return;
    if (geoDirty && totalPct !== 100) {
      toast({
        title: 'Сумма должна быть 100%',
        description: 'Отрегулируйте доли по рынкам, кластерам или регионам.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedDraft = normalizeGeoSplit(draftSplit);
    const normalized = normalizedDraft
      ? {
          ...normalizedDraft,
          allocationOrigin:
            target.level === 'unit'
              ? ({ level: 'unit', unit: target.title } as const)
              : target.level === 'team'
                ? ({ level: 'team', unit: target.breadcrumb, team: target.title } as const)
                : ({ level: 'initiative', initiativeId: target.initiativeIds[0] } as const),
        }
      : undefined;
    setIsSaving(true);
    try {
      await Promise.all([
        ...(geoDirty
          ? target.initiativeIds.map((id) => onGeoCostSplitSave(id, normalized))
          : []),
        ...(tagsDirty && target.level === 'initiative'
          ? [onInitiativeTagsSave(target.initiativeIds[0], draftTags)]
          : []),
      ]);
      toast({
        title: 'Сохранено',
        description:
          target.level === 'initiative' && tagsDirty && geoDirty
            ? 'Распределение по рынкам и теги обновлены.'
            : target.level === 'initiative' && tagsDirty
              ? 'Теги инициативы обновлены.'
              : target.level === 'initiative'
                ? 'Распределение по рынкам обновлено.'
            : `Распределение применено к ${target.initiativeIds.length} инициативам.`,
      });
      setSavedSplit(normalized);
      setDraftSplit(normalized);
      setMode('read');
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

  const inheritedFrom = (() => {
    const origin = savedSplit?.allocationOrigin;
    if (!origin) return null;
    if (origin.level === 'unit' && target.level !== 'unit') {
      return `Сейчас коэффициенты получены от юнита «${origin.unit}».`;
    }
    if (origin.level === 'team' && target.level === 'initiative') {
      return `Сейчас коэффициенты получены от команды «${origin.team}».`;
    }
    return null;
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="flex max-h-[min(92dvh,880px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 text-left">
            <p className="text-xs text-muted-foreground">{target.breadcrumb}</p>
            <DialogTitle className="text-lg leading-snug">{target.title}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
            {!readOnly && target.level !== 'unit' ? (
              <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <InitiativeAllocationComments
                  scope={
                    target.level === 'initiative'
                      ? {
                          type: 'initiative',
                          initiativeId: target.initiativeIds[0],
                        }
                      : {
                          type: 'team',
                          unit: target.breadcrumb,
                          team: target.title,
                        }
                  }
                  legacyNote={
                    target.level === 'initiative' ? savedSplit?.note : undefined
                  }
                  compact
                  hideEmptyState
                  focusedCommentId={focusedCommentId}
                />
                {inheritedFrom ? (
                  <p className="mt-1.5 text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                    {inheritedFrom} Изменение распределения здесь создаст отдельное решение для этого блока.
                  </p>
                ) : null}
              </div>
            ) : null}

            {target.description ? (
              <div className="mb-4 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Описание
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {target.description}
                </p>
              </div>
            ) : null}

            {mode === 'read' ? (
              <LocationAllocationGeoReadSummary
                split={savedSplit}
                totalCostRub={target.totalCostRub}
                countries={countries}
                countryIdToClusterKey={countryIdToClusterKey}
                onEdit={
                  readOnly
                    ? undefined
                    : () => {
                        setDraftSplit(savedSplit);
                        setMode('edit');
                      }
                }
              />
            ) : (
              <>
                {target.totalCostRub > 0 ? (
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Редактирование распределения
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {formatLocationCompactM(target.totalCostRub)}
                      </span>
                    </p>
                  </div>
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
              </>
            )}
          </div>

          {mode === 'read' ? (
            <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => requestClose(false)}
              >
                Закрыть
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3 sm:justify-between">
              <p className="self-center text-[11px] text-muted-foreground">
                {isDirty
                  ? 'Есть несохранённые изменения'
                  : 'Изменений пока нет'}
                {totalPct !== 100 ? ` · Σ ${totalPct}%` : null}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isDirty) {
                      setDiscardDestination('read');
                      setDiscardOpen(true);
                      return;
                    }
                    setDraftSplit(savedSplit);
                    setMode('read');
                  }}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !isDirty || isSaving || (geoDirty && totalPct !== 100)
                  }
                  onClick={() => {
                    if (geoDirty) {
                      setCoefficientConfirmOpen(true);
                    } else {
                      void handleSave();
                    }
                  }}
                >
                  {isSaving ? (
                    <>
                      <Loader2
                        className="mr-1.5 h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                      Сохранение…
                    </>
                  ) : geoDirty ? (
                    'Заменить коэффициенты'
                  ) : (
                    'Сохранить'
                  )}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={coefficientConfirmOpen}
        onOpenChange={setCoefficientConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Заменить коэффициенты?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущее распределение по регионам и рынкам будет заменено
              {target.initiativeIds.length > 1
                ? ` для ${target.initiativeIds.length} инициатив`
                : ''}.
              История комментариев останется без изменений.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                setCoefficientConfirmOpen(false);
                void handleSave();
              }}
            >
              Заменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {discardDestination === 'read'
                ? 'Отменить изменения?'
                : 'Закрыть без сохранения?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Изменения распределения по рынкам не будут сохранены. Добавленные
              комментарии уже находятся в истории.
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
                setDraftTags(savedTags);
                if (discardDestination === 'read') {
                  setMode('read');
                } else {
                  onOpenChange(false);
                }
              }}
            >
              {discardDestination === 'read'
                ? 'Отменить изменения'
                : 'Закрыть без сохранения'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
