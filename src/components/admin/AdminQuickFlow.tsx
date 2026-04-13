import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Calendar,
  Pencil,
  Loader2,
  Calculator,
  AlertCircle,
  AlertTriangle,
  Check,
  LayoutGrid,
  Trash2,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { AdminQuickFlowStepTrack } from '@/components/admin/AdminQuickFlowStepTrack';
import { AdminQuickFlowEffortComparePanel } from '@/components/admin/AdminQuickFlowEffortComparePanel';
import { AdminQuickFlowRosterStep } from '@/components/admin/AdminQuickFlowRosterStep';
import { AdminQuickFlowReviewTreemapStep } from '@/components/admin/AdminQuickFlowReviewTreemapStep';
import { AdminQuickFlowTimelineFillStep } from '@/components/admin/AdminQuickFlowTimelineFillStep';
import { AdminQuickFlowCountrySplitStep } from '@/components/admin/AdminQuickFlowCountrySplitStep';
import {
  AdminDataRow,
  AdminQuarterData,
  createEmptyQuarterData,
  type GeoCostSplit,
  getQuickFlowCardOnlyIssuesForQuarters,
  getQuickFlowValidationIssuesForQuarters,
} from '@/lib/adminDataManager';
import {
  compareQuarters,
  filterQuartersInRange,
  getPreviousQuarter,
  getQuarterBefore,
} from '@/lib/quarterUtils';

export type SheetsPreviewRow = {
  initiativeId: string;
  initiativeName?: string;
  itog: Record<string, number>;
};

/** Блок «Предварительный расчёт в Google Таблице» на шаге проверки. См. `docs/ADMIN_QUICK_FLOW_GOOGLE_SHEETS_PREVIEW.md`. */
const SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION = false;

interface AdminQuickFlowProps {
  filteredData: AdminDataRow[];
  /** Строки команды без черновика quick — для сравнения treemap «до / после». */
  baselineFilteredData: AdminDataRow[];
  quarters: string[];
  /** Кварталы из выгрузки в выбранном на экране контекста интервале (по возрастанию). */
  fillQuarters: string[];
  unit: string;
  team: string;
  createdInQuickSession: string[];
  /** Удаление только для id из `createdInQuickSession` (с подтверждением внутри quick flow). */
  onDeleteInitiativeAddedInQuickFlow?: (id: string) => void | Promise<void>;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
  /** Черновик полей карточки инициативы (quick flow), без записи в БД до «Сохранить». */
  onInitiativeDraftChange?: (
    id: string,
    field: 'initiative' | 'initiativeType' | 'stakeholdersList' | 'description' | 'documentationLink' | 'isTimelineStub',
    value: string | string[] | boolean
  ) => void;
  onOpenAddInitiative: () => void;
  onOpenFillInitiative?: (id: string) => void;
  hasQuickDraft?: boolean;
  onSaveQuickDraft?: () => void | Promise<void>;
  isSavingQuickDraft?: boolean;
  onRequestExitQuick?: (action: 'backToStep1', onProceed: () => void) => void;
  step?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  setStep?: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  marketCountries: MarketCountryRow[];
  /** Черновик quick: geo split + обновление stakeholders_list на родителе */
  onGeoCostSplitDraftChange: (initiativeId: string, quarter: string, split: GeoCostSplit | undefined) => void;
  queueProgress?: { current: number; total: number; teamName: string };
  onSaveAndContinueQueue?: () => void | Promise<void>;
  queueActionLoading?: boolean;
  /** Шаг 3 (Google): только для админов с доступом к Edge Functions */
  enableSheetsPreviewStep?: boolean;
  runSheetsPreviewCalculation?: () => Promise<{
    preview?: SheetsPreviewRow[];
    pollStable?: boolean;
    message?: string;
  }>;
  restoreSheetsInFromDatabase?: () => Promise<void>;
  applySheetCostsFromOut?: () => Promise<void>;
  /** Кварталы, где в черновике менялись effortCoefficient (шаг 3: превью с листа только для «следующий» при изменениях). */
  dirtyEffortQuarters?: string[];
  /**
   * Следующий квартал — конец календарного года: если ни в одном из них не меняли % усилий,
   * при «Далее» с шага 1 показываем подтверждение (не проскроллили сценарий / планы без изменений).
   */
  planningEffortQuartersNoCoeffChangeConfirm?: string[];
  /** Линейный прогресс по всему сценарию (юнит → кварталы → подшаги), если передан с родителя. */
  overallStepProgress?: { current: number; total?: number };
  /** Назад на шаг в сценарии (рядом с прогрессом). */
  onFlowStepBack?: () => void;
  /**
   * true — шаг состава показан родителем до выбора кварталов (очередь команд), внутри flow первый шаг — коэффициенты.
   * false — состав первый шаг внутри этого компонента (одиночный quick без очереди).
   */
  suppressRosterStep?: boolean;
}

type CostPeriodPreset = 'next' | 'previous' | 'year_2025' | 'year_2026';

const YEAR_2025_KEYS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'] as const;
const YEAR_2026_KEYS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

/** Кварталы 2025–2026 из выгрузки — колонки сводной таблицы и мультиселект. */
const MATRIX_TABLE_QUARTER_KEYS = new Set<string>([...YEAR_2025_KEYS, ...YEAR_2026_KEYS]);

function periodQuarterKeys(
  preset: CostPeriodPreset,
  fillQuarters: string[],
  baselineQuarter: string
): string[] {
  switch (preset) {
    case 'next':
      return fillQuarters.length > 0 ? [...fillQuarters] : [];
    case 'previous':
      return [baselineQuarter];
    case 'year_2025':
      return [...YEAR_2025_KEYS];
    case 'year_2026':
      return [...YEAR_2026_KEYS];
    default:
      return fillQuarters.length > 0 ? [...fillQuarters] : [];
  }
}

function rhsSortIndex(byQ: Record<string, number>, keys: string[]): number {
  for (let i = keys.length - 1; i >= 0; i--) {
    if ((byQ[keys[i]] ?? 0) > 0) return i;
  }
  return -1;
}

type CostRowModel = {
  initiativeId: string;
  initiativeName: string;
  byQ: Record<string, number>;
  total: number;
};

function buildDbCostRows(rows: AdminDataRow[], keys: string[]): CostRowModel[] {
  return rows.map((r) => {
    const byQ: Record<string, number> = {};
    let total = 0;
    for (const k of keys) {
      const c = Number(r.quarterlyData[k]?.cost ?? 0) || 0;
      byQ[k] = c;
      total += c;
    }
    return {
      initiativeId: r.id,
      initiativeName: r.initiative || '—',
      byQ,
      total,
    };
  });
}

function buildSheetCostRows(previewRows: SheetsPreviewRow[], quarterKeys: string[]): CostRowModel[] {
  return previewRows.map((r) => {
    const byQ: Record<string, number> = {};
    let total = 0;
    for (const k of quarterKeys) {
      const v = r.itog[k];
      const n = v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
      byQ[k] = n;
      total += n;
    }
    return {
      initiativeId: r.initiativeId,
      initiativeName: r.initiativeName ?? r.initiativeId,
      byQ,
      total,
    };
  });
}

type QuarterDataChangeHandler = (
  id: string,
  quarter: string,
  field: keyof AdminQuarterData,
  value: string | number | boolean | GeoCostSplit | undefined
) => void;

function effortStatesForQuarters(
  quarterKeys: string[],
  rows: AdminDataRow[],
  catalogQuarters: string[]
): { quarter: string; sum: number; valid: boolean; inCatalog: boolean }[] {
  return quarterKeys.map((targetQ) => {
    const sum = rows.reduce((s, row) => s + (row.quarterlyData[targetQ]?.effortCoefficient ?? 0), 0);
    return {
      quarter: targetQ,
      sum,
      valid: sum <= 100,
      inCatalog: catalogQuarters.includes(targetQ),
    };
  });
}

const matrixColAnim =
  'animate-in fade-in slide-in-from-right-3 duration-500 motion-reduce:animate-none motion-reduce:opacity-100';

type MatrixChipStateRow = {
  quarter: string;
  sum: number;
  valid: boolean;
  inCatalog: boolean;
};

type EffortMatrixChipToolbarConfig = {
  catalogQuarters: string[];
  previewQuarters: string[] | null;
  rangeAnchor: string | null;
  chipStates: MatrixChipStateRow[];
  onQuarterClick: (q: string) => void;
  onQuarterHover: (q: string | null) => void;
  onOpenAddInitiative: () => void;
  /** Выбор целиком (год, все кварталы, сброс) — сбрасывает якорь диапазона в родителе */
  onReplaceSelectedQuarters: (quarters: string[]) => void;
  /** Сброс «ждём второй клик» при закрытии выпадающего периода кликом снаружи (как на дашборде) */
  onDismissTransientRangeUI: () => void;
};

type EffortMatrixInlineProps = {
  visibleQuarters: string[];
  filteredData: AdminDataRow[];
  onQuarterDataChange: QuarterDataChangeHandler;
  className?: string;
  /** Режим split + treemap: меньше рамок, легче линии сетки, больше полезной площади. */
  splitImmersive?: boolean;
  quickSessionDeletableIds?: ReadonlySet<string>;
  onRequestDeleteQuickSessionRow?: (id: string) => void;
  chipToolbar: EffortMatrixChipToolbarConfig;
};

function EffortMatrixInline({
  visibleQuarters,
  filteredData,
  onQuarterDataChange,
  className,
  splitImmersive = false,
  quickSessionDeletableIds,
  onRequestDeleteQuickSessionRow,
  chipToolbar,
}: EffortMatrixInlineProps) {
  const {
    catalogQuarters,
    previewQuarters,
    rangeAnchor,
    chipStates,
    onQuarterClick,
    onQuarterHover,
    onOpenAddInitiative,
    onReplaceSelectedQuarters,
    onDismissTransientRangeUI,
  } = chipToolbar;

  const chipStateMap = useMemo(() => {
    const m = new Map<string, MatrixChipStateRow>();
    for (const s of chipStates) m.set(s.quarter, s);
    return m;
  }, [chipStates]);

  /** Подряд идущие кварталы одного года — для шапки «год над колонками» без дублирования года в каждой ячейке. */
  const coefficientYearGroups = useMemo(() => {
    const groups: { year: string; quarters: string[] }[] = [];
    for (const q of visibleQuarters) {
      const m = q.match(/^(\d{4})-Q[1-4]$/i);
      const year = m ? m[1] : '—';
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.quarters.push(q);
      else groups.push({ year, quarters: [q] });
    }
    return groups;
  }, [visibleQuarters]);

  const quarterYearGroupIndex = useMemo(() => {
    const m = new Map<string, number>();
    coefficientYearGroups.forEach((g, i) => {
      for (const q of g.quarters) m.set(q, i);
    });
    return m;
  }, [coefficientYearGroups]);

  const isYearColumnBoundary = useCallback(
    (q: string) => {
      const idx = visibleQuarters.indexOf(q);
      if (idx <= 0) return false;
      const prev = visibleQuarters[idx - 1];
      const y = (x: string) => x.match(/^(\d{4})-/)?.[1] ?? '';
      return y(q) !== y(prev);
    },
    [visibleQuarters]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const q of catalogQuarters) {
      const m = q.match(/^(\d{4})-Q[1-4]$/);
      if (m) years.add(m[1]);
    }
    return [...years].sort();
  }, [catalogQuarters]);

  const periodRef = useRef<HTMLDivElement>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodMenuOpen(false);
        onDismissTransientRangeUI();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onDismissTransientRangeUI]);

  const periodLabel = useMemo(() => {
    const sel = visibleQuarters;
    const cat = catalogQuarters;
    if (sel.length === 0) return 'Период';
    if (
      cat.length > 0 &&
      sel.length === cat.length &&
      sel.every((q) => cat.includes(q))
    ) {
      if (availableYears.length === 0) return 'Все кварталы';
      return `${availableYears[0]}–${availableYears[availableYears.length - 1]}`;
    }
    if (sel.length === 1) return sel[0].replace('-', ' ');
    return `${sel.length} кв.`;
  }, [visibleQuarters, catalogQuarters, availableYears]);

  const canOfferDelete = Boolean(
    quickSessionDeletableIds && quickSessionDeletableIds.size > 0 && onRequestDeleteQuickSessionRow
  );

  const handleToggleYear = useCallback(
    (year: string) => {
      const yearQs = catalogQuarters.filter((q) => q.startsWith(`${year}-`)).sort(compareQuarters);
      if (yearQs.length === 0) return;
      const allIn = yearQs.every((q) => visibleQuarters.includes(q));
      if (allIn) {
        onReplaceSelectedQuarters(
          visibleQuarters.filter((q) => !q.startsWith(`${year}-`)).sort(compareQuarters)
        );
      } else {
        const set = new Set(visibleQuarters);
        yearQs.forEach((q) => set.add(q));
        onReplaceSelectedQuarters(catalogQuarters.filter((q) => set.has(q)).sort(compareQuarters));
      }
    },
    [catalogQuarters, visibleQuarters, onReplaceSelectedQuarters]
  );

  const handleSelectAllCatalog = useCallback(() => {
    onReplaceSelectedQuarters([...catalogQuarters].sort(compareQuarters));
  }, [catalogQuarters, onReplaceSelectedQuarters]);

  const handleResetQuarters = useCallback(() => {
    onReplaceSelectedQuarters([]);
  }, [onReplaceSelectedQuarters]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        splitImmersive
          ? 'rounded-none border-0 bg-transparent shadow-none'
          : 'rounded-lg border border-border bg-card/90 shadow-sm',
        'animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none motion-reduce:opacity-100',
        className
      )}
    >
      <div
        className={cn(
          'flex shrink-0 flex-col gap-2 border-b border-border/80 bg-muted/20 px-2 py-2 sm:px-2.5',
          splitImmersive && 'border-border/55 bg-transparent'
        )}
      >
        <div className="flex shrink-0 items-start gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            onClick={onOpenAddInitiative}
            aria-label="Добавить инициативу"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <div ref={periodRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setPeriodMenuOpen((o) => !o)}
              aria-expanded={periodMenuOpen}
              aria-haspopup="dialog"
              className={cn(
                'flex w-full min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs font-medium hover:border-muted-foreground',
                periodMenuOpen && 'border-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{periodLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {periodMenuOpen ? (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[min(100%,300px)] max-w-[min(100vw-1rem,320px)] rounded-lg border border-border bg-card p-2 shadow-lg animate-in fade-in slide-in-from-top-1"
                role="dialog"
                aria-label="Период таблицы"
              >
                <div className="mb-2 flex justify-between border-b border-border pb-2">
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={handleSelectAllCatalog}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={handleResetQuarters}
                  >
                    Сброс
                  </button>
                </div>
                <p className="mb-2 text-[10px] text-muted-foreground">
                  {rangeAnchor
                    ? `Конец: ${rangeAnchor.replace('-', ' ')}`
                    : 'Клик — начало и конец диапазона; наведение — предпросмотр'}
                </p>
                <div className="max-h-[min(50vh,16rem)] overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
                  {availableYears.map((year) => {
                    const yearQuarters = catalogQuarters
                      .filter((q) => q.startsWith(year))
                      .sort(compareQuarters);
                    const allYearSelected =
                      yearQuarters.length > 0 && yearQuarters.every((q) => visibleQuarters.includes(q));
                    return (
                      <div key={year} className="mb-2 last:mb-0">
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs font-semibold hover:bg-secondary"
                          onClick={() => handleToggleYear(year)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleYear(year);
                            }
                          }}
                        >
                          <span
                            className={cn(
                              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                              allYearSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border'
                            )}
                          >
                            {allYearSelected ? <Check size={10} aria-hidden /> : null}
                          </span>
                          {year}
                        </div>
                        <div className="mt-1 grid grid-cols-4 gap-1 px-1.5">
                          {yearQuarters.map((q) => {
                            const qLabel = q.split('-')[1] ?? q;
                            const isSelected = visibleQuarters.includes(q);
                            const isHovered = previewQuarters != null && previewQuarters.includes(q);
                            const isStart = rangeAnchor === q;
                            return (
                              <button
                                key={q}
                                type="button"
                                onClick={() => onQuarterClick(q)}
                                onMouseEnter={() => onQuarterHover(q)}
                                onMouseLeave={() => onQuarterHover(null)}
                                className={cn(
                                  'rounded border px-1.5 py-1 text-[10px] transition-all',
                                  isStart
                                    ? 'border-primary bg-primary text-primary-foreground ring-1 ring-primary/30'
                                    : isSelected
                                      ? 'border-foreground bg-foreground text-background'
                                      : isHovered
                                        ? 'border-primary/50 bg-primary/30'
                                        : 'border-border bg-secondary hover:border-muted-foreground'
                                )}
                              >
                                {qLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {visibleQuarters.length === 0 ? (
        <div
          className={cn(
            'flex min-h-[10rem] flex-1 flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground',
            splitImmersive ? 'border-y border-border/45 bg-card/30 dark:bg-card/20' : ''
          )}
        >
          Откройте «Период» кнопкой выше и выберите диапазон двумя кликами, год или «Все»
        </div>
      ) : (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto overscroll-contain',
            splitImmersive ? 'p-0' : 'p-1.5 sm:p-2'
          )}
        >
          <div
            className={cn(
              'overflow-x-auto',
              splitImmersive
                ? 'rounded-none border-y border-border/45 bg-card/40 dark:bg-card/25'
                : 'rounded-md border border-border'
            )}
          >
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr
                  className={cn(
                    'border-b bg-muted/80',
                    splitImmersive ? 'border-border/55' : 'border-border'
                  )}
                >
                  <th
                    rowSpan={2}
                    className={cn(
                      'sticky left-0 z-20 min-w-[130px] max-w-[200px] px-2 py-1.5 text-left text-xs font-medium sm:px-2.5',
                      splitImmersive
                        ? 'border-r border-border/50 bg-muted/90 align-middle dark:bg-muted/80'
                        : 'border-r border-border bg-muted align-middle'
                    )}
                  >
                    Инициатива
                  </th>
                  {coefficientYearGroups.map((g, gi) => (
                    <th
                      key={`y-${g.year}-${gi}`}
                      colSpan={g.quarters.length}
                      className={cn(
                        'border-b px-1 py-1 text-center align-middle text-[10px] font-semibold tabular-nums tracking-wide text-muted-foreground',
                        splitImmersive
                          ? 'border-border/55 bg-muted/70 dark:bg-muted/60'
                          : 'border-border bg-muted/90',
                        gi > 0 && (splitImmersive ? 'border-l-2 border-l-border/70' : 'border-l-2 border-l-border'),
                        gi % 2 === 1 &&
                          (splitImmersive ? 'bg-muted/55 dark:bg-muted/50' : 'bg-muted/95')
                      )}
                      scope="colgroup"
                    >
                      {g.year}
                    </th>
                  ))}
                </tr>
                <tr
                  className={cn(
                    'border-b bg-muted/80',
                    splitImmersive ? 'border-border/55' : 'border-border'
                  )}
                >
                  {visibleQuarters.map((q) => {
                    const st = chipStateMap.get(q);
                    const qShort = q.split('-')[1] ?? q;
                    const sum = st?.sum ?? 0;
                    const inCat = st?.inCatalog ?? false;
                    const valid = st?.valid ?? true;
                    const baseline = inCat && valid && sum === 100;
                    const missingCol = Boolean(st && !inCat);
                    const overflow = inCat && !valid;
                    const gi = quarterYearGroupIndex.get(q) ?? 0;
                    const yearStart = isYearColumnBoundary(q);
                    return (
                      <th
                        key={q}
                        scope="col"
                        className={cn(
                          matrixColAnim,
                          'min-w-[76px] px-1 py-1.5 text-center align-bottom sm:min-w-[84px]',
                          splitImmersive
                            ? 'border-r border-border/35 last:border-r-0'
                            : 'border-r border-border last:border-r-0',
                          yearStart && (splitImmersive ? 'border-l-2 border-l-border/70' : 'border-l-2 border-l-border'),
                          gi % 2 === 1 &&
                            (splitImmersive ? 'bg-muted/40 dark:bg-muted/35' : 'bg-muted/85')
                        )}
                      >
                        <div className="tabular-nums text-xs font-semibold">{qShort}</div>
                        <div className="mt-0.5 flex min-h-[14px] items-center justify-center gap-0.5">
                          {missingCol ? (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                          ) : baseline ? (
                            <span className="text-[9px] font-normal tabular-nums text-muted-foreground/80">
                              100%
                            </span>
                          ) : overflow ? (
                            <span className="flex items-center gap-0.5 text-[9px] font-semibold tabular-nums text-primary">
                              {sum}%
                              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold tabular-nums text-primary">{sum}%</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
              {filteredData.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b last:border-0',
                    splitImmersive ? 'border-border/35' : 'border-border'
                  )}
                >
                  <td
                    className={cn(
                      'group/name sticky left-0 z-10 max-w-[220px] px-2 py-1.5 align-middle sm:px-3 sm:py-2',
                      splitImmersive
                        ? 'border-r border-border/45 bg-background/95 backdrop-blur-[2px] dark:bg-background/90'
                        : 'border-r border-border bg-background',
                      row.isTimelineStub && (splitImmersive ? 'bg-muted/35' : 'bg-muted/40')
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{row.initiative || '—'}</span>
                        {row.isTimelineStub ? (
                          <span className="text-[10px] text-muted-foreground">Заглушка таймлайна</span>
                        ) : null}
                      </div>
                      {canOfferDelete && quickSessionDeletableIds!.has(row.id) ? (
                        <button
                          type="button"
                          onClick={() => onRequestDeleteQuickSessionRow!(row.id)}
                          className={cn(
                            'mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity',
                            'hover:bg-destructive/10 hover:text-destructive',
                            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                            'group-hover/name:opacity-100 group-focus-within/name:opacity-100'
                          )}
                          title="Удалить инициативу"
                          aria-label={`Удалить инициативу «${row.initiative || '—'}»`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {visibleQuarters.map((q) => {
                    const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
                    const effort = qd.effortCoefficient ?? 0;
                    const gi = quarterYearGroupIndex.get(q) ?? 0;
                    const yearStart = isYearColumnBoundary(q);
                    return (
                      <td
                        key={q}
                        className={cn(
                          matrixColAnim,
                          'p-1 text-center align-middle last:border-r-0 sm:p-1.5',
                          splitImmersive
                            ? 'border-r border-border/30 last:border-r-0'
                            : 'border-r border-border last:border-r-0',
                          yearStart && (splitImmersive ? 'border-l-2 border-l-border/70' : 'border-l-2 border-l-border'),
                          gi % 2 === 1 &&
                            (splitImmersive ? 'bg-muted/25 dark:bg-muted/20' : 'bg-muted/30')
                        )}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={effort === 0 ? '' : effort}
                          onChange={(e) =>
                            onQuarterDataChange(
                              row.id,
                              q,
                              'effortCoefficient',
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="mx-auto h-8 w-[4rem] px-1 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none sm:w-[4.25rem]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}

function sortCostRows(rows: CostRowModel[], keys: string[]): CostRowModel[] {
  return [...rows].sort((a, b) => {
    const aPos = a.total > 0 ? 1 : 0;
    const bPos = b.total > 0 ? 1 : 0;
    if (aPos !== bPos) return bPos - aPos;
    const ar = rhsSortIndex(a.byQ, keys);
    const br = rhsSortIndex(b.byQ, keys);
    if (ar !== br) return br - ar;
    if (b.total !== a.total) return b.total - a.total;
    return a.initiativeName.localeCompare(b.initiativeName, 'ru');
  });
}

function formatCost(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function formatPctShare(total: number, teamTotal: number): string {
  if (teamTotal <= 0 || total <= 0) return '—';
  return `${((total / teamTotal) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;
}

export default function AdminQuickFlow({
  filteredData,
  baselineFilteredData,
  quarters,
  fillQuarters,
  unit,
  team,
  createdInQuickSession,
  onDeleteInitiativeAddedInQuickFlow,
  onQuarterDataChange,
  onInitiativeDraftChange,
  onOpenAddInitiative,
  onOpenFillInitiative,
  hasQuickDraft,
  onSaveQuickDraft,
  isSavingQuickDraft,
  onRequestExitQuick,
  step: stepProp,
  setStep: setStepProp,
  queueProgress,
  onSaveAndContinueQueue,
  queueActionLoading,
  enableSheetsPreviewStep = false,
  runSheetsPreviewCalculation,
  restoreSheetsInFromDatabase,
  applySheetCostsFromOut,
  dirtyEffortQuarters = [],
  planningEffortQuartersNoCoeffChangeConfirm = [],
  overallStepProgress,
  onFlowStepBack,
  suppressRosterStep = false,
  marketCountries,
  onGeoCostSplitDraftChange,
}: AdminQuickFlowProps) {
  const { toast } = useToast();
  const [stepLocal, setStepLocal] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const step = stepProp ?? stepLocal;
  const setStep = setStepProp ?? setStepLocal;
  const [treemapCompareOpen, setTreemapCompareOpen] = useState(false);
  const [coeffSkipConfirmOpen, setCoeffSkipConfirmOpen] = useState(false);
  const [quickSessionDeleteConfirmId, setQuickSessionDeleteConfirmId] = useState<string | null>(null);
  const [quickSessionDeleteLoading, setQuickSessionDeleteLoading] = useState(false);

  const rosterStep = suppressRosterStep ? null : 1;
  const stepCoeff = suppressRosterStep ? 1 : 2;
  const stepTreemap = suppressRosterStep ? 2 : 3;
  const stepTimeline = suppressRosterStep ? 3 : 4;
  const stepCountrySplit = suppressRosterStep ? 4 : 5;
  const stepValidation = suppressRosterStep ? 5 : 6;
  const stepSheets = suppressRosterStep ? 6 : 7;
  const maxStep = enableSheetsPreviewStep
    ? suppressRosterStep
      ? 6
      : 7
    : suppressRosterStep
      ? 5
      : 6;

  const [previewRows, setPreviewRows] = useState<SheetsPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoreInLoading, setRestoreInLoading] = useState(false);
  const [applyOutLoading, setApplyOutLoading] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<{ pollStable?: boolean; message?: string } | null>(null);
  const [costPeriodPreset, setCostPeriodPreset] = useState<CostPeriodPreset>('next');

  useEffect(() => {
    if (!enableSheetsPreviewStep && step === stepSheets) {
      setStep(stepValidation);
    }
  }, [enableSheetsPreviewStep, step, setStep, stepSheets, stepValidation]);

  useEffect(() => {
    if (step !== stepSheets) {
      setPreviewRows(null);
      setPreviewMeta(null);
      setCostPeriodPreset('next');
    }
  }, [step, stepSheets]);

  useEffect(() => {
    if (step !== stepCoeff) setTreemapCompareOpen(false);
  }, [step, stepCoeff]);

  const baselineQuarter =
    fillQuarters.length > 0 ? getQuarterBefore(fillQuarters[0]) : getPreviousQuarter();

  const quarterEffortStates = useMemo(() => {
    return fillQuarters.map((targetQ) => {
      const sum = filteredData.reduce(
        (s, row) => s + (row.quarterlyData[targetQ]?.effortCoefficient ?? 0),
        0
      );
      return {
        quarter: targetQ,
        sum,
        valid: sum <= 100,
        inCatalog: quarters.includes(targetQ),
      };
    });
  }, [filteredData, fillQuarters, quarters]);

  const allTargetsInCatalog =
    fillQuarters.length > 0 && quarterEffortStates.every((s) => s.inCatalog);
  const allEffortsValid = quarterEffortStates.every((s) => s.valid);

  const matrixCatalogQuarters = useMemo(() => {
    const from25_26 = quarters.filter((q) => MATRIX_TABLE_QUARTER_KEYS.has(q)).sort(compareQuarters);
    if (from25_26.length > 0) return from25_26;
    return [...fillQuarters].filter((q) => quarters.includes(q)).sort(compareQuarters);
  }, [quarters, fillQuarters]);

  const [matrixSelectedQuarters, setMatrixSelectedQuarters] = useState<string[]>([]);
  const [matrixRangeAnchor, setMatrixRangeAnchor] = useState<string | null>(null);
  const [matrixHoverQuarter, setMatrixHoverQuarter] = useState<string | null>(null);

  useEffect(() => {
    setMatrixRangeAnchor(null);
    setMatrixHoverQuarter(null);
    setMatrixSelectedQuarters((prev) => {
      const kept = prev.filter((q) => matrixCatalogQuarters.includes(q));
      if (kept.length === 0 && matrixCatalogQuarters.length > 0) {
        const interval = fillQuarters.filter((q) => matrixCatalogQuarters.includes(q));
        if (interval.length > 0) return interval;
        return [...matrixCatalogQuarters];
      }
      return matrixCatalogQuarters.filter((q) => kept.includes(q));
    });
  }, [matrixCatalogQuarters, fillQuarters]);

  const matrixPreviewQuarters = useMemo(() => {
    if (!matrixRangeAnchor || !matrixHoverQuarter) return null;
    return filterQuartersInRange(matrixRangeAnchor, matrixHoverQuarter, matrixCatalogQuarters);
  }, [matrixRangeAnchor, matrixHoverQuarter, matrixCatalogQuarters]);

  const handleMatrixQuarterClick = useCallback(
    (q: string) => {
      if (matrixRangeAnchor == null) {
        setMatrixRangeAnchor(q);
        setMatrixSelectedQuarters([q]);
      } else {
        setMatrixSelectedQuarters(filterQuartersInRange(matrixRangeAnchor, q, matrixCatalogQuarters));
        setMatrixRangeAnchor(null);
      }
      setMatrixHoverQuarter(null);
    },
    [matrixRangeAnchor, matrixCatalogQuarters]
  );

  const replaceMatrixSelectedQuarters = useCallback((qs: string[]) => {
    setMatrixRangeAnchor(null);
    setMatrixHoverQuarter(null);
    setMatrixSelectedQuarters(qs);
  }, []);

  const dismissMatrixTransientRangeUI = useCallback(() => {
    setMatrixRangeAnchor(null);
    setMatrixHoverQuarter(null);
  }, []);

  const matrixChipStates = useMemo(
    () => effortStatesForQuarters(matrixCatalogQuarters, filteredData, quarters),
    [matrixCatalogQuarters, filteredData, quarters]
  );

  const validationIssues = useMemo(
    () => getQuickFlowValidationIssuesForQuarters(filteredData, fillQuarters),
    [filteredData, fillQuarters]
  );

  /** Шаг 2 (treemap): «Далее» только когда карточки в порядке по всему интервалу сценария. */
  const reviewStepCardIssues = useMemo(
    () => getQuickFlowCardOnlyIssuesForQuarters(filteredData, fillQuarters),
    [filteredData, fillQuarters]
  );

  const teamInitiativeIds = useMemo(() => new Set(filteredData.map((r) => r.id)), [filteredData]);

  const quickSessionDeletableIdsSet = useMemo(
    () => new Set(createdInQuickSession),
    [createdInQuickSession]
  );

  const handleRequestDeleteQuickSessionRow = useCallback(
    (id: string) => {
      if (!onDeleteInitiativeAddedInQuickFlow) return;
      if (!quickSessionDeletableIdsSet.has(id)) return;
      setQuickSessionDeleteConfirmId(id);
    },
    [onDeleteInitiativeAddedInQuickFlow, quickSessionDeletableIdsSet]
  );

  const quickSessionDeleteRowLabel = useMemo(() => {
    if (!quickSessionDeleteConfirmId) return '';
    return (
      filteredData.find((r) => r.id === quickSessionDeleteConfirmId)?.initiative?.trim() || '—'
    );
  }, [quickSessionDeleteConfirmId, filteredData]);

  const confirmQuickSessionDelete = useCallback(async () => {
    const id = quickSessionDeleteConfirmId;
    if (!id || !onDeleteInitiativeAddedInQuickFlow) return;
    setQuickSessionDeleteLoading(true);
    try {
      await onDeleteInitiativeAddedInQuickFlow(id);
      setQuickSessionDeleteConfirmId(null);
    } finally {
      setQuickSessionDeleteLoading(false);
    }
  }, [quickSessionDeleteConfirmId, onDeleteInitiativeAddedInQuickFlow]);

  const costPreviewModel = useMemo(() => {
    const quarterKeys = periodQuarterKeys(costPeriodPreset, fillQuarters, baselineQuarter);
    const dirtySet = new Set(dirtyEffortQuarters);
    const intervalDirty = fillQuarters.some((q) => dirtySet.has(q));
    const useSheet =
      costPeriodPreset === 'next' &&
      intervalDirty &&
      previewRows != null &&
      previewRows.length > 0 &&
      quarterKeys.length > 0;

    let source: 'sheet' | 'db';
    let banner: string;
    let rows: CostRowModel[];

    if (costPeriodPreset !== 'next') {
      source = 'db';
      banner =
        'Агрегация по выбранному периоду из базы (последнее сохранение). Для истории не нужно каждый раз запускать Google — расчёт листа здесь относится к выбранному интервалу.';
      rows = sortCostRows(buildDbCostRows(filteredData, quarterKeys), quarterKeys);
    } else if (!intervalDirty) {
      source = 'db';
      banner =
        'Коэффициенты за выбранный интервал в этом сеансе не менялись — показаны сохранённые стоимости из базы. При желании всё равно можно нажать «Рассчитать предварительно» и сравнить с листом.';
      rows = sortCostRows(buildDbCostRows(filteredData, quarterKeys), quarterKeys);
    } else if (useSheet) {
      source = 'sheet';
      banner =
        'Значения с листа OUT после «Рассчитать предварительно» (черновик коэффициентов для интервала учтён на листе).';
      rows = sortCostRows(buildSheetCostRows(previewRows, quarterKeys), quarterKeys);
    } else {
      source = 'db';
      banner =
        'Коэффициенты за выбранный интервал изменены в сеансе. Нажмите «Рассчитать предварительно», чтобы получить актуальные суммы с Google Таблицы; ниже — последние сохранённые в базе.';
      rows = sortCostRows(buildDbCostRows(filteredData, quarterKeys), quarterKeys);
    }

    const teamTotal = rows.reduce((s, r) => s + r.total, 0);
    const needsSheetRecalc = costPeriodPreset === 'next' && intervalDirty && !useSheet;
    return { quarterKeys, source, banner, rows, teamTotal, needsSheetRecalc };
  }, [
    costPeriodPreset,
    fillQuarters,
    baselineQuarter,
    dirtyEffortQuarters,
    previewRows,
    filteredData,
  ]);

  const handleBackToCoefficients = useCallback(() => {
    if (onRequestExitQuick) onRequestExitQuick('backToStep1', () => setStep(stepCoeff));
    else setStep(stepCoeff);
  }, [onRequestExitQuick, setStep, stepCoeff]);

  const handleRunPreview = useCallback(async () => {
    if (!runSheetsPreviewCalculation) return;
    setPreviewLoading(true);
    try {
      const res = await runSheetsPreviewCalculation();
      const raw = res.preview ?? [];
      const scoped = raw.filter((r) => teamInitiativeIds.has(r.initiativeId));
      setPreviewRows(scoped);
      setPreviewMeta({ pollStable: res.pollStable, message: res.message });
      if (scoped.length === 0) {
        toast({
          title: 'Нет строк для команды',
          description:
            'На листе OUT не найдено итогов по UUID инициатив этой команды. Проверьте колонки O–R (2025) и Y–AB (2026) и строку с данными.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Предпросчёт готов',
          description: res.pollStable
            ? 'Значения на листе стабилизировались после пересчёта.'
            : 'Показаны последние прочитанные значения (пересчёт мог ещё идти).',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        variant: 'destructive',
        title: 'Ошибка предпросчёта',
        description: msg,
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [runSheetsPreviewCalculation, teamInitiativeIds, toast]);

  const handleRestoreIn = useCallback(async () => {
    if (!restoreSheetsInFromDatabase) return;
    setRestoreInLoading(true);
    try {
      await restoreSheetsInFromDatabase();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось восстановить IN',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRestoreInLoading(false);
    }
  }, [restoreSheetsInFromDatabase, toast]);

  const handleApplyOut = useCallback(async () => {
    if (!applySheetCostsFromOut) return;
    setApplyOutLoading(true);
    try {
      await applySheetCostsFromOut();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось записать стоимости',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setApplyOutLoading(false);
    }
  }, [applySheetCostsFromOut, toast]);

  const displayStep = step > maxStep ? maxStep : step;

  const step1EditorReady =
    fillQuarters.length > 0 &&
    allTargetsInCatalog &&
    filteredData.length > 0 &&
    matrixCatalogQuarters.length > 0;

  const canProceedToStep2 =
    fillQuarters.length > 0 && allTargetsInCatalog && allEffortsValid;

  const goToTreemapStep = useCallback(() => {
    setCoeffSkipConfirmOpen(false);
    setStep(stepTreemap);
  }, [setStep, stepTreemap]);

  const requestGoToTreemapStep = useCallback(() => {
    if (!canProceedToStep2) return;
    const pq = planningEffortQuartersNoCoeffChangeConfirm;
    if (pq.length === 0) {
      goToTreemapStep();
      return;
    }
    const dirty = new Set(dirtyEffortQuarters);
    if (pq.some((q) => dirty.has(q))) {
      goToTreemapStep();
      return;
    }
    setCoeffSkipConfirmOpen(true);
  }, [
    canProceedToStep2,
    planningEffortQuartersNoCoeffChangeConfirm,
    dirtyEffortQuarters,
    goToTreemapStep,
  ]);

  const handleQuickFlowStepBack = useCallback(() => {
    if (step === stepCoeff && treemapCompareOpen) {
      setTreemapCompareOpen(false);
      return;
    }
    onFlowStepBack?.();
  }, [step, stepCoeff, treemapCompareOpen, onFlowStepBack]);

  const trackRow = (
    <div className="flex shrink-0 flex-col gap-2 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 min-w-0">
        <AdminQuickFlowStepTrack
          className="min-w-0 flex-1 pt-0.5"
          current={overallStepProgress?.current ?? displayStep}
          total={overallStepProgress?.total ?? maxStep}
          onStepBack={handleQuickFlowStepBack}
          unit={unit?.trim() || undefined}
          team={team?.trim() || undefined}
          queueCurrent={
            queueProgress && queueProgress.total > 0 ? queueProgress.current : undefined
          }
          queueTotal={queueProgress && queueProgress.total > 0 ? queueProgress.total : undefined}
        />
        {rosterStep !== null && step === rosterStep ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            title="Перейти к коэффициентам (подтверждение состава по кварталам пока не обязательно)"
            onClick={() => setStep(stepCoeff)}
          >
            Далее
            <ChevronRight size={15} className="shrink-0" aria-hidden />
          </Button>
        ) : null}
        {step === stepCoeff && !treemapCompareOpen ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            disabled={
              matrixCatalogQuarters.length === 0 ||
              filteredData.length === 0 ||
              matrixSelectedQuarters.length === 0
            }
            title="Открыть сравнение treemap по выбранным в матрице кварталам"
            onClick={() => setTreemapCompareOpen(true)}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            Сравнение treemap
          </Button>
        ) : null}
        {step === stepCoeff && treemapCompareOpen ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            disabled={!canProceedToStep2}
            onClick={requestGoToTreemapStep}
          >
            Далее
            <ChevronRight size={15} className="shrink-0" aria-hidden />
          </Button>
        ) : null}
        {step === stepTreemap ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            disabled={reviewStepCardIssues.length > 0}
            title={
              reviewStepCardIssues.length > 0
                ? 'Сначала заполните обязательные поля карточки у инициатив с долей усилий в интервале сценария'
                : 'К шагу «Заполнение таймлайна по кварталам»'
            }
            onClick={() => setStep(stepTimeline)}
          >
            Далее
            <ChevronRight size={15} className="shrink-0" aria-hidden />
          </Button>
        ) : null}
        {step === stepTimeline ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            title="К шагу распределения по странам"
            onClick={() => setStep(stepCountrySplit)}
          >
            Далее
            <ChevronRight size={15} className="shrink-0" aria-hidden />
          </Button>
        ) : null}
        {step === stepCountrySplit ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
            title="К шагу «Проверка перед завершением»"
            onClick={() => setStep(stepValidation)}
          >
            Далее
            <ChevronRight size={15} className="shrink-0" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );

  const renderStep1Body = () => (
    <>
            <header className={cn('shrink-0', treemapCompareOpen && 'pl-0.5')}>
              <h1
                className={cn(
                  'font-juneau text-balance font-medium tracking-tight',
                  treemapCompareOpen
                    ? 'text-lg font-medium sm:text-xl'
                    : 'text-xl sm:text-2xl'
                )}
              >
                Заполните коэффициенты
              </h1>
            </header>
            <section
              className={cn(
                'mx-auto w-full',
                treemapCompareOpen
                  ? cn(
                      'max-w-none rounded-none border-0 bg-transparent shadow-none',
                      step1EditorReady
                        ? 'flex min-h-0 flex-1 flex-col px-0 py-1 sm:py-1.5'
                        : 'px-0 py-3 sm:py-4'
                    )
                  : cn(
                      'max-w-6xl rounded-xl border border-border bg-card',
                      step1EditorReady ? 'flex min-h-0 flex-1 flex-col p-3 sm:p-4' : 'p-4 sm:p-5'
                    )
              )}
            >

              {fillQuarters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Нет кварталов в выгрузке для выбранного интервала. Вернитесь к настройке контекста или обновите
                  данные.
                </p>
              ) : !allTargetsInCatalog ? (
                <p className="text-sm text-muted-foreground">
                  Для части кварталов интервала нет колонок в текущей выгрузке. Добавьте кварталы через импорт или
                  обновите данные.
                </p>
              ) : filteredData.length === 0 ? (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  <p>Нет инициатив. Добавьте первую кнопкой выше.</p>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenAddInitiative}>
                    <Plus size={14} />
                    Добавить инициативу
                  </Button>
                </div>
              ) : matrixCatalogQuarters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  В выгрузке нет колонок кварталов 2025–2026 для таблицы. Проверьте импорт и загрузку выгрузки.
                </p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2 pt-1">
                  <EffortMatrixInline
                    visibleQuarters={matrixSelectedQuarters}
                    filteredData={filteredData}
                    onQuarterDataChange={onQuarterDataChange}
                    splitImmersive={treemapCompareOpen}
                    quickSessionDeletableIds={
                      onDeleteInitiativeAddedInQuickFlow ? quickSessionDeletableIdsSet : undefined
                    }
                    onRequestDeleteQuickSessionRow={
                      onDeleteInitiativeAddedInQuickFlow
                        ? handleRequestDeleteQuickSessionRow
                        : undefined
                    }
                    chipToolbar={{
                      catalogQuarters: matrixCatalogQuarters,
                      previewQuarters: matrixPreviewQuarters,
                      rangeAnchor: matrixRangeAnchor,
                      chipStates: matrixChipStates,
                      onQuarterClick: handleMatrixQuarterClick,
                      onQuarterHover: setMatrixHoverQuarter,
                      onOpenAddInitiative,
                      onReplaceSelectedQuarters: replaceMatrixSelectedQuarters,
                      onDismissTransientRangeUI: dismissMatrixTransientRangeUI,
                    }}
                  />
                </div>
              )}
            </section>
    </>
  );

  return (
    <div
      className={cn(
        'flex min-h-0 w-full min-w-0 flex-1 flex-col',
        step === stepCoeff && treemapCompareOpen
          ? 'overflow-hidden px-2 py-2 sm:px-3 sm:py-2 lg:px-4'
          : step === stepCoeff && !treemapCompareOpen
            ? 'overflow-hidden px-4 py-2 sm:px-5 sm:py-3 lg:px-8'
          : step === stepTreemap || step === stepTimeline || step === stepCountrySplit
            ? 'overflow-hidden px-4 pt-4 pb-6 sm:px-5 sm:pb-8 lg:px-8'
          : rosterStep !== null && step === rosterStep
            ? 'overflow-hidden px-4 py-3 sm:px-5 sm:py-4 lg:px-8'
            : 'overflow-auto px-4 py-4 sm:px-5 lg:px-8'
      )}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-none min-w-0',
          step === stepCoeff &&
            treemapCompareOpen &&
            'flex min-h-0 flex-1 flex-col gap-2 min-w-0',
          step === stepCoeff && !treemapCompareOpen && 'flex min-h-0 min-w-0 flex-1 flex-col gap-2',
          ((rosterStep !== null && step === rosterStep) ||
            step === stepTreemap ||
            step === stepTimeline ||
            step === stepCountrySplit ||
            step === stepValidation ||
            step === stepSheets) &&
            'flex min-h-0 min-w-0 flex-1 flex-col gap-5',
          rosterStep !== null && step === rosterStep && 'overflow-hidden'
        )}
      >
        {step === stepCoeff && treemapCompareOpen ? (
          <>
            <div className="shrink-0 min-w-0 w-full">{trackRow}</div>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(272px,39%)_minmax(0,1fr)] lg:items-stretch">
              <div
                className={cn(
                  'flex min-h-0 min-w-0 flex-col gap-2 overflow-auto lg:min-h-0 lg:overflow-hidden',
                  'border-border/60 bg-muted/20 pr-2 dark:bg-muted/15 lg:border-r lg:pr-3'
                )}
              >
                {renderStep1Body()}
              </div>
              <AdminQuickFlowEffortComparePanel
                baselineRows={baselineFilteredData}
                currentRows={filteredData}
                previewQuarters={matrixSelectedQuarters}
                immersive
                className="min-h-[320px] lg:min-h-0"
                onCloseComparison={() => setTreemapCompareOpen(false)}
              />
            </div>
          </>
        ) : null}
        {!(step === stepCoeff && treemapCompareOpen) ? (
          <>
            {trackRow}
            {rosterStep !== null && step === rosterStep ? (
              <AdminQuickFlowRosterStep
                unit={unit}
                team={team}
                fillQuarters={fillQuarters}
                quartersCatalog={quarters}
              />
            ) : null}
            {step === stepCoeff ? renderStep1Body() : null}
            {step === stepTreemap ? (
              <AdminQuickFlowReviewTreemapStep
                rows={filteredData}
                fillQuarters={fillQuarters}
                quartersCatalog={matrixCatalogQuarters}
                onInitiativeDraftChange={onInitiativeDraftChange}
              />
            ) : null}
            {step === stepTimeline ? (
              <AdminQuickFlowTimelineFillStep
                rows={filteredData}
                fillQuarters={fillQuarters}
                quartersCatalog={matrixCatalogQuarters}
                exportQuarters={quarters}
                unit={unit}
                team={team}
                onQuarterDataChange={onQuarterDataChange}
                onInitiativeDraftChange={onInitiativeDraftChange}
              />
            ) : null}
            {step === stepCountrySplit ? (
              marketCountries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Загрузка справочника стран…</p>
              ) : (
                <AdminQuickFlowCountrySplitStep
                  rows={filteredData}
                  fillQuarters={fillQuarters}
                  quartersCatalog={quarters}
                  countries={marketCountries}
                  onGeoChange={onGeoCostSplitDraftChange}
                />
              )
            ) : null}
            {step === stepValidation ? (
          <section className="rounded-xl border border-border bg-card p-6 max-w-2xl">
            <h2 className="text-lg font-semibold mb-2">Проверка перед завершением</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Инициативы с процентом усилий должны иметь заполненные обязательные поля. Исправьте перечисленное ниже или вернитесь к коэффициентам.
            </p>

            {validationIssues.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 mb-6">
                <p className="text-sm font-medium text-foreground">Всё заполнено.</p>
                <p className="text-sm text-muted-foreground mt-1">Можете сохранить и продолжить сценарий или вернуться к коэффициентам.</p>
              </div>
            ) : (
              <ul className="space-y-3 mb-6">
                {validationIssues.map(({ id, initiativeName, missing }) => (
                  <li key={id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{initiativeName}</span>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Не заполнено: {missing.join(', ')}
                      </span>
                    </div>
                    {onOpenFillInitiative && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => onOpenFillInitiative(id)}
                        aria-label={`Заполнить поля инициативы ${initiativeName}`}
                      >
                        <Pencil size={14} />
                        Заполнить
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION &&
              enableSheetsPreviewStep &&
              runSheetsPreviewCalculation && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 mb-6 space-y-2">
                <p className="text-sm font-medium text-foreground">Предварительный расчёт в Google Таблице</p>
                <p className="text-xs text-muted-foreground">
                  Одновременно расчёт должен запускать только один администратор: лист IN перезаписывается для всей книги.
                  База не меняется, пока вы не нажмёте «Записать стоимости из таблицы в базу».
                </p>
                <Button type="button" className="gap-1.5 mt-2" onClick={() => setStep(stepSheets)}>
                  Далее: предварительный расчёт
                  <ChevronRight size={16} />
                </Button>
                {validationIssues.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Есть замечания по полям — расчёт всё равно доступен; при необходимости заполните их позже после сохранения.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {queueProgress && onSaveAndContinueQueue && (
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <Button
                    className="gap-1.5 sm:order-first"
                    disabled={queueActionLoading || isSavingQuickDraft}
                    onClick={() => void onSaveAndContinueQueue()}
                  >
                    {queueActionLoading || isSavingQuickDraft
                      ? 'Сохранение…'
                      : queueProgress.current < queueProgress.total
                        ? 'Сохранить и перейти к следующей команде'
                        : 'Сохранить и завершить'}
                  </Button>
                  <p className="text-xs text-muted-foreground sm:self-center">
                    {queueProgress.current < queueProgress.total
                      ? 'При необходимости сначала сохраните черновик коэффициентов кнопкой ниже.'
                      : 'После завершения вы вернётесь к выбору сценария.'}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {hasQuickDraft && onSaveQuickDraft && (
                  <>
                    <span className="text-xs text-muted-foreground">Несохранённые изменения</span>
                    <Button onClick={() => void onSaveQuickDraft()} disabled={isSavingQuickDraft} variant="secondary" size="sm">
                      {isSavingQuickDraft ? 'Сохранение…' : 'Только сохранить'}
                    </Button>
                  </>
                )}
                <Button type="button" variant="ghost" onClick={() => setStep(stepCountrySplit)}>
                  Назад к распределению по странам
                </Button>
                <Button onClick={handleBackToCoefficients} variant="ghost">
                  Назад к коэффициентам
                </Button>
              </div>
            </div>
          </section>
            ) : null}
            {step === stepSheets ? (
          <section className="rounded-xl border border-border bg-card p-6 max-w-5xl space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Calculator size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Предварительный расчёт (лист OUT)</h2>
              </div>
              {(unit || team) && (
                <span className="text-sm text-muted-foreground">
                  {[unit, team].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Коэффициенты из этого шага (включая несохранённые в базе) отправляются на лист IN как оверрайды; после пересчёта формул читаются итоги с OUT: 2025 — O–R; 2026 — Y–AB.
              Для <span className="font-medium text-foreground">выбранного интервала</span>, если вы меняли % в сеансе, после «Рассчитать предварительно» в таблице показываются цифры с листа; иначе и для других периодов — суммы из базы (последнее сохранение).
              База не обновляется, пока вы не нажмёте «Записать стоимости из таблицы в базу».
            </p>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-muted-foreground">
              Не запускайте расчёт одновременно с другим администратором. Если передумали — восстановите лист IN из базы (без черновых процентов).
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-0 max-w-md">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cost-period-preset">
                  Период для таблицы стоимостей
                </label>
                <Select
                  value={costPeriodPreset}
                  onValueChange={(v) => setCostPeriodPreset(v as CostPeriodPreset)}
                >
                  <SelectTrigger id="cost-period-preset" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="next">
                      Выбранный интервал ({fillQuarters.join(' · ') || '—'})
                    </SelectItem>
                    <SelectItem value="previous">Базовый квартал ({baselineQuarter})</SelectItem>
                    <SelectItem value="year_2025">Весь 2025 (Q1–Q4)</SelectItem>
                    <SelectItem value="year_2026">Весь 2026 (Q1–Q4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground sm:pb-2">
                Источник:{' '}
                <span className="font-medium text-foreground">
                  {costPreviewModel.source === 'sheet' ? 'лист OUT после расчёта' : 'база данных'}
                </span>
              </p>
            </div>

            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                costPreviewModel.source === 'sheet'
                  ? 'border-emerald-500/35 bg-emerald-500/5 text-foreground'
                  : costPreviewModel.needsSheetRecalc
                    ? 'border-blue-500/30 bg-blue-500/5 text-muted-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground'
              )}
            >
              {costPreviewModel.banner}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-1.5"
                disabled={previewLoading || !runSheetsPreviewCalculation}
                onClick={() => void handleRunPreview()}
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                Рассчитать предварительно
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={restoreInLoading || !restoreSheetsInFromDatabase}
                onClick={() => void handleRestoreIn()}
              >
                {restoreInLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Сбросить лист IN по базе
              </Button>
              {onSaveQuickDraft && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSavingQuickDraft}
                  onClick={() => void onSaveQuickDraft()}
                >
                  {isSavingQuickDraft ? 'Сохранение…' : 'Сохранить коэффициенты в базу'}
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                disabled={applyOutLoading || !applySheetCostsFromOut}
                onClick={() => void handleApplyOut()}
              >
                {applyOutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Записать стоимости из таблицы в базу
              </Button>
            </div>

            {previewMeta?.message && (
              <p className="text-xs text-muted-foreground">{previewMeta.message}</p>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Сумма по команде за выбранный период (все строки):{' '}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCost(costPreviewModel.teamTotal)}
                  </span>
                </p>
              </div>
              {costPreviewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет инициатив в выборке.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left p-2 font-medium">Инициатива</th>
                        {costPreviewModel.quarterKeys.map((qk) => (
                          <th key={qk} className="text-right p-2 font-medium whitespace-nowrap">
                            {qk}
                          </th>
                        ))}
                        <th className="text-right p-2 font-medium whitespace-nowrap">Итого</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costPreviewModel.rows.map((row) => (
                        <tr
                          key={row.initiativeId}
                          className={cn(
                            'border-b border-border/60',
                            row.total === 0 && 'opacity-55'
                          )}
                        >
                          <td className="p-2 max-w-[200px] truncate" title={row.initiativeName}>
                            {row.initiativeName.length > 48 ? `${row.initiativeName.slice(0, 48)}…` : row.initiativeName}
                          </td>
                          {costPreviewModel.quarterKeys.map((qk) => (
                            <td key={qk} className="p-2 text-right tabular-nums">
                              {formatCost(row.byQ[qk] ?? 0)}
                            </td>
                          ))}
                          <td className="p-2 text-right tabular-nums font-medium">{formatCost(row.total)}</td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">
                            {formatPctShare(row.total, costPreviewModel.teamTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setStep(stepValidation)}>
                Назад к проверке
              </Button>
            </div>
          </section>
            ) : null}
          </>
        ) : null}
      </div>

      <AlertDialog
        open={quickSessionDeleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setQuickSessionDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить инициативу?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p className="text-sm text-muted-foreground">
                Вы точно хотите удалить инициативу «{quickSessionDeleteRowLabel}»?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={quickSessionDeleteLoading}>
              Отмена
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={quickSessionDeleteLoading}
              onClick={() => void confirmQuickSessionDelete()}
            >
              {quickSessionDeleteLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              Удалить
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={coeffSkipConfirmOpen} onOpenChange={setCoeffSkipConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Не меняли коэффициенты в ближайших кварталах?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  В этом сеансе вы не правили доли усилий (%) ни в одном из кварталов от следующего после текущего
                  календарного до конца года в выгрузке:
                </p>
                <p className="font-medium text-foreground">
                  {planningEffortQuartersNoCoeffChangeConfirm.join(', ')}
                </p>
                <p>
                  Если планы команды не менялись и текущие коэффициенты вас устраивают — можно продолжить. Если вы
                  просто не успели обновить цифры или забыли про этот шаг — вернитесь к таблице и внесите изменения.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Вернуться к таблице</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={goToTreemapStep}>
              Планы без изменений, далее
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
