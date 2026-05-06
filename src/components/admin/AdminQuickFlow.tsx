import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Plus,
  ChevronRight,
  Loader2,
  Calculator,
  AlertCircle,
  AlertTriangle,
  LayoutGrid,
  ListChecks,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
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
import { AdminQuickFlowCountryAllocationsSummary } from '@/components/admin/AdminQuickFlowCountryAllocationsSummary';
import { AdminQuickFlowCountrySplitStep } from '@/components/admin/AdminQuickFlowCountrySplitStep';
import {
  AdminDataRow,
  AdminQuarterData,
  createEmptyQuarterData,
  type GeoCostSplit,
  getQuickFlowRowsWithIncompleteGeoSplit,
  getQuickFlowValidationIssuesForQuarters,
  effortMatrixColumnChipState,
  getStubResidualLabel,
  nonStubQuarterEffortSum,
} from '@/lib/adminDataManager';
import {
  compareQuarters,
  filterQuartersInRange,
  getPreviousQuarter,
  getQuarterBefore,
} from '@/lib/quarterUtils';
import { AdminQuickFlowEffortMascot } from '@/components/admin/AdminQuickFlowEffortMascot';
import { AdminQuickFlowValidationStep } from '@/components/admin/AdminQuickFlowValidationStep';
import { AdminQuickFlowMatrixPeriodPicker } from '@/components/admin/AdminQuickFlowMatrixPeriodPicker';

export type SheetsPreviewRow = {
  initiativeId: string;
  initiativeName?: string;
  itog: Record<string, number>;
};

/** Блок «Предварительный расчёт в Google Таблице» на шаге проверки. См. `docs/ADMIN_QUICK_FLOW_GOOGLE_SHEETS_PREVIEW.md`. */
const SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION = false;

const BACK_TO_VALIDATION_TITLE =
  'Вернуться к матрице проверки без прохода следующих шагов сценария';

function QuickFlowBackToValidationButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={BACK_TO_VALIDATION_TITLE}
      onClick={onClick}
      className={cn(
        'h-8 min-h-8 justify-start gap-2 rounded-lg border-primary/40 bg-primary/[0.04] px-2 py-0 pr-3 text-primary shadow-sm transition-[border-color,box-shadow,background-color] hover:border-primary/55 hover:bg-primary/[0.09] hover:shadow-md dark:border-primary/35 dark:bg-primary/[0.08] dark:hover:bg-primary/[0.14] [&_svg]:size-[15px]',
        className
      )}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/14 text-primary shadow-inner ring-1 ring-primary/15 dark:bg-primary/22 dark:ring-primary/25"
        aria-hidden
      >
        <ListChecks className="size-[15px]" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 text-pretty text-left text-[12.5px] font-semibold leading-snug tracking-tight sm:text-sm">
        Вернуться к проверке перед завершением
      </span>
    </Button>
  );
}

interface AdminQuickFlowProps {
  filteredData: AdminDataRow[];
  /** Строки команды без черновика quick — для сравнения treemap «до / после». */
  baselineFilteredData: AdminDataRow[];
  quarters: string[];
  /** Кварталы из выгрузки в выбранном на экране контекста интервале (по возрастанию). */
  fillQuarters: string[];
  /** Черновик экрана усилий по людям (те же query в URL). */
  peopleEffortFillTo?: string;
  unit: string;
  team: string;
  /** Удаление инициативы из БД с шага коэффициентов (все строки команды; подтверждение внутри quick flow). */
  onDeleteInitiativeAddedInQuickFlow?: (id: string) => void | Promise<void>;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | undefined
  ) => void;
  /** Черновик полей карточки инициативы (quick flow), без записи в БД до «Сохранить». */
  onInitiativeDraftChange?: (
    id: string,
    field: 'initiative' | 'stakeholdersList' | 'description' | 'documentationLink' | 'isTimelineStub',
    value: string | string[] | boolean
  ) => void;
  /** Резерв, если нет `onQuickAddInitiativeRow`. */
  onOpenAddInitiative?: () => void;
  /** Шаг коэффициентов: + в заголовке «Инициатива» — новая строка в БД (черновое имя, дальше правки в таблице). */
  onQuickAddInitiativeRow?: () => void | Promise<void>;
  onOpenFillInitiative?: (id: string) => void;
  hasQuickDraft?: boolean;
  onSaveQuickDraft?: () => void | Promise<void>;
  isSavingQuickDraft?: boolean;
  onRequestExitQuick?: (action: 'backToStep1', onProceed: () => void) => void;
  step?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  setStep?: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
  marketCountries: MarketCountryRow[];
  /** Черновик quick: geo split + обновление stakeholders_list на родителе */
  onGeoCostSplitDraftChange: (initiativeId: string, split: GeoCostSplit | undefined) => void;
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
  /** Линейный прогресс по всему сценарию (юнит → кварталы → подшаги), если передан с родителя. */
  overallStepProgress?: { current: number; total?: number };
  /** Назад на шаг в сценарии (рядом с прогрессом). */
  onFlowStepBack?: () => void;
  /**
   * Перед шагом «Проверьте описание…» (кнопка «Далее» после сравнения treemap на шаге коэффициентов):
   * записать в БД стоимости как в превью treemap (предварительно, без подтверждения финансами).
   */
  onPersistPreviewCostsBeforeTimeline?: () => void | Promise<void>;
  /**
   * true — шаг состава показан родителем до выбора кварталов (очередь команд), внутри flow первый шаг — коэффициенты.
   * false — состав первый шаг внутри этого компонента (одиночный quick без очереди).
   */
  suppressRosterStep?: boolean;
  /** Сфокусировать поле названия в матрице коэффициентов (например после добавления строки). */
  focusMatrixInitiativeId?: string | null;
  onFocusMatrixInitiativeConsumed?: () => void;
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
      initiativeName: r.isTimelineStub ? getStubResidualLabel(r.team) : r.initiative || '—',
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
  value: string | number | boolean | undefined
) => void;

function effortStatesForQuarters(
  quarterKeys: string[],
  rows: AdminDataRow[],
  catalogQuarters: string[]
): { quarter: string; sum: number; nonStubSum: number; valid: boolean; inCatalog: boolean }[] {
  return quarterKeys.map((targetQ) => {
    const chip = effortMatrixColumnChipState(rows, targetQ);
    return {
      quarter: targetQ,
      sum: chip.sum,
      nonStubSum: chip.nonStubSum,
      valid: chip.valid,
      inCatalog: catalogQuarters.includes(targetQ),
    };
  });
}

function effortMatrixYearPrefix(key: string): string {
  return key.match(/^(\d{4})-/)?.[1] ?? '';
}

/**
 * Локальный черновик + сохранение по blur/Enter, чтобы refetch после PATCH не откатывал строку
 * (гонка: invalidate → GET быстрее, чем отражение update в реплике).
 */
function MatrixInitiativeNameInput({
  rowId,
  serverValue,
  onCommit,
  setInputRef,
  className,
}: {
  rowId: string;
  serverValue: string;
  onCommit: (id: string, value: string) => void;
  setInputRef?: (el: HTMLInputElement | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => serverValue);
  const lastCommittedRef = useRef(serverValue);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(serverValue);
    lastCommittedRef.current = serverValue;
  }, [serverValue, rowId]);

  const flushIfDirty = useCallback(() => {
    if (draft !== lastCommittedRef.current) {
      onCommit(rowId, draft);
      lastCommittedRef.current = draft;
    }
  }, [draft, onCommit, rowId]);

  return (
    <Input
      ref={setInputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        flushIfDirty();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onDoubleClick={(e) => e.currentTarget.select()}
      aria-label="Название инициативы"
      title={
        draft.trim()
          ? `${draft.trim()} · двойной клик — выделить всё · Enter — сохранить`
          : 'Двойной клик — выделить название · Enter — сохранить'
      }
      className={className}
    />
  );
}

type MatrixChipStateRow = {
  quarter: string;
  sum: number;
  nonStubSum: number;
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

export type EffortMatrixInlineProps = {
  visibleQuarters: string[];
  filteredData: AdminDataRow[];
  onQuarterDataChange: QuarterDataChangeHandler;
  className?: string;
  /** Режим split + treemap: меньше рамок, легче линии сетки, больше полезной площади. */
  splitImmersive?: boolean;
  /** Id строк, для которых показывается кнопка удаления в первой колонке. */
  quickSessionDeletableIds?: ReadonlySet<string>;
  onRequestDeleteQuickSessionRow?: (id: string) => void;
  chipToolbar: EffortMatrixChipToolbarConfig;
  /** Скрыть выпадающий выбор периода (например, если период задаётся снаружи). */
  hidePeriodPicker?: boolean;
  /** Компактная панель периода: одна строка, меньше отступов. */
  compactPeriodPicker?: boolean;
  hideAddInitiativeButton?: boolean;
  /** + у заголовка «Инициатива» (quick flow). */
  onHeaderAddInitiativeRow?: () => void | Promise<void>;
  /** Редактирование названия в первой колонце (черновик quick flow). */
  onInitiativeNameChange?: (id: string, name: string) => void;
  focusInitiativeId?: string | null;
  onFocusInitiativeConsumed?: () => void;
};

export function EffortMatrixInline({
  visibleQuarters,
  filteredData,
  onQuarterDataChange,
  className,
  splitImmersive = false,
  quickSessionDeletableIds,
  onRequestDeleteQuickSessionRow,
  chipToolbar,
  hidePeriodPicker = false,
  compactPeriodPicker = false,
  hideAddInitiativeButton = false,
  onHeaderAddInitiativeRow,
  onInitiativeNameChange,
  focusInitiativeId = null,
  onFocusInitiativeConsumed,
}: EffortMatrixInlineProps) {
  const [headerAddBusy, setHeaderAddBusy] = useState(false);
  const nameInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useLayoutEffect(() => {
    if (!focusInitiativeId) return;
    const el = nameInputRefs.current.get(focusInitiativeId);
    if (el) {
      el.focus();
      el.select();
    }
    onFocusInitiativeConsumed?.();
  }, [focusInitiativeId, filteredData, onFocusInitiativeConsumed]);

  const handleHeaderAddClick = useCallback(async () => {
    if (!onHeaderAddInitiativeRow || headerAddBusy) return;
    setHeaderAddBusy(true);
    try {
      await onHeaderAddInitiativeRow();
    } finally {
      setHeaderAddBusy(false);
    }
  }, [onHeaderAddInitiativeRow, headerAddBusy]);
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
  const matrixRows = useMemo(() => {
    const stubs = filteredData.filter((row) => row.isTimelineStub === true);
    if (stubs.length === 0) return filteredData;
    const regularRows = filteredData.filter((row) => row.isTimelineStub !== true);
    return [...regularRows, ...stubs];
  }, [filteredData]);

  const matrixHasTimelineStub = useMemo(
    () => filteredData.some((r) => r.isTimelineStub === true),
    [filteredData]
  );

  const nonStubEffortByQuarter = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of visibleQuarters) {
      m.set(q, nonStubQuarterEffortSum(filteredData, q));
    }
    return m;
  }, [filteredData, visibleQuarters]);

  /** Сумма (cost + otherCosts) по всем строкам команды в квартале — для подсказки в шапке. */
  const quarterTeamCostRub = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of visibleQuarters) {
      let s = 0;
      for (const row of filteredData) {
        const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
        s += Number(qd.cost ?? 0) + Number(qd.otherCosts ?? 0);
      }
      m.set(q, s);
    }
    return m;
  }, [filteredData, visibleQuarters]);

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
      return effortMatrixYearPrefix(q) !== effortMatrixYearPrefix(prev);
    },
    [visibleQuarters]
  );

  const canOfferDelete = Boolean(
    quickSessionDeletableIds && quickSessionDeletableIds.size > 0 && onRequestDeleteQuickSessionRow
  );

  const initiativeColClass = splitImmersive
    ? 'min-w-[220px] max-w-[min(100vw,24rem)] sm:max-w-[26rem]'
    : 'min-w-[280px] max-w-[min(100vw,30rem)] sm:min-w-[320px] sm:max-w-[min(100vw,36rem)]';

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        splitImmersive
          ? 'rounded-none border-0 bg-transparent shadow-none'
          : 'rounded-lg border border-border bg-card/90 shadow-sm',
        className
      )}
    >
      <AdminQuickFlowMatrixPeriodPicker
        catalogQuarters={catalogQuarters}
        visibleQuarters={visibleQuarters}
        previewQuarters={previewQuarters}
        rangeAnchor={rangeAnchor}
        onQuarterClick={onQuarterClick}
        onQuarterHover={onQuarterHover}
        onReplaceSelectedQuarters={onReplaceSelectedQuarters}
        onDismissTransientRangeUI={onDismissTransientRangeUI}
        compactPeriodPicker={compactPeriodPicker}
        hidePeriodPicker={hidePeriodPicker}
        hideAddInitiativeButton={hideAddInitiativeButton || Boolean(onHeaderAddInitiativeRow)}
        onOpenAddInitiative={onOpenAddInitiative}
        splitImmersive={splitImmersive}
      />

      {visibleQuarters.length === 0 ? (
        <div
          className={cn(
            'flex min-h-[10rem] flex-1 flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground',
            splitImmersive ? 'border-y border-border/45 bg-card/30 dark:bg-card/20' : ''
          )}
        >
          {hidePeriodPicker
            ? 'Нет кварталов в каталоге выгрузки.'
            : 'Выберите диапазон кварталов в поле периода выше или пресет «Все кварталы»'}
        </div>
      ) : (
        <div
          className={cn(
            'relative z-0 min-h-0 flex-1 overflow-auto overscroll-contain',
            splitImmersive ? 'p-0' : 'p-1.5 sm:p-2'
          )}
        >
          <table
            className={cn(
              'w-full min-w-[560px] border-separate border-spacing-0 text-sm',
              splitImmersive
                ? 'rounded-none border-y border-border/45 bg-card/40 dark:bg-card/25'
                : 'rounded-md border border-border'
            )}
          >
            <thead className="[&_th]:border-b [&_th]:bg-muted [&_th]:shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <th
                  className={cn(
                    'sticky left-0 top-0 z-50 px-2 py-2 text-left text-xs font-medium sm:px-2.5',
                    initiativeColClass,
                    splitImmersive
                      ? 'border-r border-border/50 align-middle dark:bg-muted'
                      : 'border-r border-border align-middle'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 leading-tight">Инициатива</span>
                    {onHeaderAddInitiativeRow ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={cn(
                          'h-7 shrink-0 gap-1 px-2 text-xs font-medium text-foreground shadow-sm',
                          compactPeriodPicker && 'h-6'
                        )}
                        disabled={headerAddBusy || visibleQuarters.length === 0}
                        title="Добавить новую инициативу"
                        aria-label="Добавить инициативу"
                        onClick={() => void handleHeaderAddClick()}
                      >
                        {headerAddBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span>Новая</span>
                      </Button>
                    ) : null}
                  </div>
                </th>
                {visibleQuarters.map((q, qi) => {
                  const st = chipStateMap.get(q);
                  const qShort = q.split('-')[1] ?? q;
                  const sum = st?.sum ?? 0;
                  const nonStubSum = st?.nonStubSum ?? sum;
                  const inCat = st?.inCatalog ?? false;
                  const valid = st?.valid ?? true;
                  const residualToStubPct =
                    valid && matrixHasTimelineStub ? Math.round((100 - sum) * 100) / 100 : null;
                  const baseline = inCat && valid && Math.abs(nonStubSum - 100) < 0.02;
                  const missingCol = Boolean(st && !inCat);
                  const overflow = inCat && !valid;
                  const gi = quarterYearGroupIndex.get(q) ?? 0;
                  const yearStart = isYearColumnBoundary(q);
                  const prevQ = qi > 0 ? visibleQuarters[qi - 1] : null;
                  const showYear = !prevQ || effortMatrixYearPrefix(q) !== effortMatrixYearPrefix(prevQ);
                  const yearLabel = effortMatrixYearPrefix(q);
                  const costRub = quarterTeamCostRub.get(q) ?? 0;
                  const costLine = `${Math.round(costRub).toLocaleString('ru-RU')} ₽`;
                  return (
                    <th
                      key={q}
                      scope="col"
                      className={cn(
                        'sticky top-0 z-40 min-w-[76px] px-1 py-1.5 text-center align-top sm:min-w-[84px]',
                        splitImmersive
                          ? 'border-r border-border/35 last:border-r-0 dark:bg-muted'
                          : 'border-r border-border last:border-r-0',
                        yearStart && (splitImmersive ? 'border-l-2 border-l-border/70' : 'border-l-2 border-l-border'),
                        gi % 2 === 1 && (splitImmersive ? 'bg-muted dark:bg-muted' : 'bg-muted')
                      )}
                    >
                      <Tooltip delayDuration={280}>
                        <TooltipTrigger asChild>
                          <div
                            role="presentation"
                            tabIndex={0}
                            className={cn(
                              'group/col cursor-default rounded-md px-0.5 pb-0.5 outline-none transition-[background-color,box-shadow]',
                              'hover:bg-muted/80 hover:shadow-sm',
                              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                              splitImmersive && 'hover:bg-muted/50 dark:hover:bg-muted/40'
                            )}
                          >
                            <div className="flex min-h-[14px] items-end justify-center text-[10px] font-semibold tabular-nums leading-none text-muted-foreground">
                              {showYear ? (
                                yearLabel
                              ) : (
                                <span className="opacity-0 select-none" aria-hidden>
                                  {yearLabel}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 tabular-nums text-xs font-semibold text-foreground">{qShort}</div>
                            <div className="mt-0.5 flex min-h-[14px] items-center justify-center gap-0.5">
                              {missingCol ? (
                                <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                              ) : baseline ? (
                                <span className="text-[9px] font-normal tabular-nums text-muted-foreground/80">100%</span>
                              ) : overflow ? (
                                <span className="flex items-center gap-0.5 text-[9px] font-semibold tabular-nums text-primary">
                                  {Math.round(nonStubSum * 100) / 100}%
                                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold tabular-nums text-primary">{sum}%</span>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="center" className="max-w-[16rem] space-y-1 text-left text-xs">
                          <p className="font-semibold text-foreground">{q.replace('-', ' ')}</p>
                          <p className="text-muted-foreground">
                            Сумма по строкам (без «Нераспределено»):{' '}
                            <span className="font-medium tabular-nums text-foreground">{sum}%</span>
                            {!inCat ? ' · колонка не в текущей выгрузке' : !valid ? ' · превышает 100%' : null}
                          </p>
                          {!inCat || !valid ? null : residualToStubPct != null &&
                            residualToStubPct > 0 ? (
                            <p className="text-muted-foreground">
                              Остаток на заглушке:{' '}
                              <span className="font-medium tabular-nums text-foreground">
                                {residualToStubPct}%
                              </span>
                            </p>
                          ) : null}
                          <p>
                            Стоимость по команде в квартале:{' '}
                            <span className="font-semibold tabular-nums text-foreground">{costLine}</span>
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              Сумма основной и прочих затрат по всем инициативам в колонке.
                            </span>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => {
                const isStub = row.isTimelineStub === true;
                const stubLabel = isStub ? getStubResidualLabel(row.team) : null;
                return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b last:border-0',
                    splitImmersive ? 'border-border/35' : 'border-border'
                  )}
                  title={isStub ? stubLabel ?? undefined : row.initiative?.trim() || undefined}
                >
                  <td
                    className={cn(
                      'group/name sticky left-0 z-10 px-2 py-1.5 align-middle sm:px-3 sm:py-2',
                      initiativeColClass,
                      splitImmersive
                        ? 'border-r border-border/45 bg-background/95 backdrop-blur-[2px] dark:bg-background/90'
                        : 'border-r border-border bg-background',
                      isStub && (splitImmersive ? 'bg-muted/35' : 'bg-muted/40')
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-0.5">
                      {canOfferDelete ? (
                        <div className="flex h-8 w-6 shrink-0 items-center justify-center">
                          {!isStub && quickSessionDeletableIds!.has(row.id) ? (
                            <button
                              type="button"
                              onClick={() => onRequestDeleteQuickSessionRow!(row.id)}
                              className={cn(
                                'shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity',
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
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {isStub ? (
                          <span
                            className="truncate text-xs font-medium leading-snug text-muted-foreground"
                            title="Контейнер остатка бюджета команды. Имя и коэффициенты не редактируются — заглушка держит то, что не разнесли по инициативам."
                          >
                            {stubLabel}
                          </span>
                        ) : onInitiativeNameChange ? (
                          <MatrixInitiativeNameInput
                            key={row.id}
                            rowId={row.id}
                            serverValue={row.initiative ?? ''}
                            onCommit={onInitiativeNameChange}
                            setInputRef={(el) => {
                              if (el) nameInputRefs.current.set(row.id, el);
                              else nameInputRefs.current.delete(row.id);
                            }}
                            className={cn(
                              'h-8 min-w-0 w-full max-w-full border-transparent bg-transparent px-1 text-xs font-medium leading-snug shadow-none',
                              'hover:bg-muted/40 focus-visible:border-input focus-visible:bg-background',
                              '[&:focus-visible]:ring-1 [&:focus-visible]:ring-ring'
                            )}
                          />
                        ) : (
                          <span className="truncate text-xs font-medium leading-snug">{row.initiative || '—'}</span>
                        )}
                      </div>
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
                          'p-1 text-center align-middle last:border-r-0 sm:p-1.5',
                          splitImmersive
                            ? 'border-r border-border/30 last:border-r-0'
                            : 'border-r border-border last:border-r-0',
                          yearStart && (splitImmersive ? 'border-l-2 border-l-border/70' : 'border-l-2 border-l-border'),
                          gi % 2 === 1 &&
                            (splitImmersive ? 'bg-muted/25 dark:bg-muted/20' : 'bg-muted/30')
                        )}
                      >
                        {isStub ? (
                          (() => {
                            const colNs = nonStubEffortByQuarter.get(q) ?? 0;
                            const over = colNs > 100 + 1e-4;
                            if (over) {
                              return (
                                <div
                                  className="mx-auto flex h-8 w-[4rem] items-center justify-center rounded-md text-sm tabular-nums text-muted-foreground/50 sm:w-[4.25rem]"
                                  aria-label="Перебор по колонке"
                                  title="Сумма по строкам превышает 100%."
                                >
                                  —
                                </div>
                              );
                            }
                            const residual = Math.round((100 - colNs) * 100) / 100;
                            return (
                              <div
                                className="mx-auto flex h-8 w-[4rem] items-center justify-center rounded-md text-sm tabular-nums text-muted-foreground sm:w-[4.25rem]"
                                aria-label={`Остаток до 100%: ${residual}%`}
                                title="Остаток до 100% в колонке (не редактируется)."
                              >
                                {residual}%
                              </div>
                            );
                          })()
                        ) : (
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
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
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
  peopleEffortFillTo,
  unit,
  team,
  onDeleteInitiativeAddedInQuickFlow,
  onQuarterDataChange,
  onInitiativeDraftChange,
  onOpenAddInitiative,
  onQuickAddInitiativeRow,
  onOpenFillInitiative,
  hasQuickDraft,
  onSaveQuickDraft,
  isSavingQuickDraft,
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
  overallStepProgress,
  onFlowStepBack,
  onPersistPreviewCostsBeforeTimeline,
  suppressRosterStep = false,
  marketCountries,
  onGeoCostSplitDraftChange,
  focusMatrixInitiativeId = null,
  onFocusMatrixInitiativeConsumed,
}: AdminQuickFlowProps) {
  const { toast } = useToast();
  const [stepLocal, setStepLocal] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const step = stepProp ?? stepLocal;
  const setStep = setStepProp ?? setStepLocal;
  const [treemapCompareOpen, setTreemapCompareOpen] = useState(false);
  const [quickSessionDeleteConfirmId, setQuickSessionDeleteConfirmId] = useState<string | null>(null);
  const [quickSessionDeleteLoading, setQuickSessionDeleteLoading] = useState(false);
  const [countrySplitIncompleteDialogOpen, setCountrySplitIncompleteDialogOpen] = useState(false);
  /** Шаг, на который перешли с «Проверки…» через «Вернуться к шагу» — вместо «Далее» показываем возврат к проверке. */
  const [validationRepairStep, setValidationRepairStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null>(null);
  const rosterStep = suppressRosterStep ? null : 1;
  const stepCoeff = suppressRosterStep ? 1 : 2;
  const stepTreemap = suppressRosterStep ? 2 : 3;
  const stepTimeline = suppressRosterStep ? 3 : 4;
  const stepCountrySplit = suppressRosterStep ? 4 : 5;
  const stepCountrySummary = suppressRosterStep ? 5 : 6;
  const stepValidation = suppressRosterStep ? 6 : 7;
  const stepSheets = suppressRosterStep ? 7 : 8;
  const maxStep = enableSheetsPreviewStep
    ? suppressRosterStep
      ? 7
      : 8
    : suppressRosterStep
      ? 6
      : 7;

  const [previewRows, setPreviewRows] = useState<SheetsPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoreInLoading, setRestoreInLoading] = useState(false);
  const [applyOutLoading, setApplyOutLoading] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<{ pollStable?: boolean; message?: string } | null>(null);
  const [costPeriodPreset, setCostPeriodPreset] = useState<CostPeriodPreset>('next');

  const noopAddInitiative = useCallback(() => {}, []);

  useEffect(() => {
    if (step === stepValidation) {
      setValidationRepairStep(null);
    }
  }, [step, stepValidation]);

  useEffect(() => {
    if (validationRepairStep == null) return;
    if (step === validationRepairStep || step === stepValidation) return;
    setValidationRepairStep(null);
  }, [step, validationRepairStep, stepValidation]);

  const jumpToStepFromValidation = useCallback(
    (target: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => {
      setValidationRepairStep(target);
      setStep(target);
    },
    [setStep]
  );

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

  useLayoutEffect(() => {
    if (step === stepCoeff) setTreemapCompareOpen(true);
    else setTreemapCompareOpen(false);
  }, [step, stepCoeff]);

  const baselineQuarter =
    fillQuarters.length > 0 ? getQuarterBefore(fillQuarters[0]) : getPreviousQuarter();

  const quarterEffortStates = useMemo(() => {
    return fillQuarters.map((targetQ) => {
      const chip = effortMatrixColumnChipState(filteredData, targetQ);
      return {
        quarter: targetQ,
        sum: chip.sum,
        valid: chip.valid,
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
  const [matrixPreviewQuarters, setMatrixPreviewQuarters] = useState<string[] | null>(null);

  useEffect(() => {
    const cat = matrixCatalogQuarters;
    if (cat.length === 0) {
      setMatrixSelectedQuarters([]);
      return;
    }
    setMatrixSelectedQuarters((prev) => {
      const filtered = prev.filter((q) => cat.includes(q)).sort(compareQuarters);
      if (filtered.length === 0) return [...cat];
      return filtered;
    });
  }, [matrixCatalogQuarters]);

  const handleMatrixReplaceQuarters = useCallback((next: string[]) => {
    setMatrixSelectedQuarters([...next].sort(compareQuarters));
    setMatrixRangeAnchor(null);
    setMatrixPreviewQuarters(null);
  }, []);

  const handleMatrixDismissRangeUI = useCallback(() => {
    setMatrixRangeAnchor(null);
    setMatrixPreviewQuarters(null);
  }, []);

  const handleMatrixQuarterClick = useCallback(
    (q: string) => {
      if (matrixRangeAnchor == null) {
        setMatrixRangeAnchor(q);
        setMatrixPreviewQuarters(null);
        return;
      }
      const range = filterQuartersInRange(matrixRangeAnchor, q, matrixCatalogQuarters);
      setMatrixSelectedQuarters(range);
      setMatrixRangeAnchor(null);
      setMatrixPreviewQuarters(null);
    },
    [matrixRangeAnchor, matrixCatalogQuarters]
  );

  const handleMatrixQuarterHover = useCallback(
    (q: string | null) => {
      if (matrixRangeAnchor == null || q == null) {
        setMatrixPreviewQuarters(null);
        return;
      }
      setMatrixPreviewQuarters(filterQuartersInRange(matrixRangeAnchor, q, matrixCatalogQuarters));
    },
    [matrixRangeAnchor, matrixCatalogQuarters]
  );

  const matrixVisibleQuarters = useMemo(() => {
    const sel = new Set(matrixSelectedQuarters);
    return matrixCatalogQuarters.filter((q) => sel.has(q));
  }, [matrixCatalogQuarters, matrixSelectedQuarters]);

  const matrixChipStates = useMemo(
    () => effortStatesForQuarters(matrixCatalogQuarters, filteredData, quarters),
    [matrixCatalogQuarters, filteredData, quarters]
  );

  const matrixToolbarConfig = useMemo(
    () => ({
      catalogQuarters: matrixCatalogQuarters,
      previewQuarters: matrixPreviewQuarters,
      rangeAnchor: matrixRangeAnchor,
      chipStates: matrixChipStates,
      onQuarterClick: handleMatrixQuarterClick,
      onQuarterHover: handleMatrixQuarterHover,
      onOpenAddInitiative: onQuickAddInitiativeRow ? noopAddInitiative : (onOpenAddInitiative ?? noopAddInitiative),
      onReplaceSelectedQuarters: handleMatrixReplaceQuarters,
      onDismissTransientRangeUI: handleMatrixDismissRangeUI,
    }),
    [
      matrixCatalogQuarters,
      matrixPreviewQuarters,
      matrixRangeAnchor,
      matrixChipStates,
      handleMatrixQuarterClick,
      handleMatrixQuarterHover,
      handleMatrixReplaceQuarters,
      handleMatrixDismissRangeUI,
      onOpenAddInitiative,
      onQuickAddInitiativeRow,
      noopAddInitiative,
    ]
  );

  const validationIssues = useMemo(
    () => getQuickFlowValidationIssuesForQuarters(filteredData, fillQuarters),
    [filteredData, fillQuarters]
  );

  const rowsIncompleteGeoForCountryStep = useMemo(
    () => getQuickFlowRowsWithIncompleteGeoSplit(filteredData, fillQuarters),
    [filteredData, fillQuarters]
  );

  const proceedToCountrySummary = useCallback(() => {
    setCountrySplitIncompleteDialogOpen(false);
    setStep(stepCountrySummary);
  }, [setStep, stepCountrySummary]);

  const requestProceedToCountrySummary = useCallback(() => {
    if (rowsIncompleteGeoForCountryStep.length > 0) {
      setCountrySplitIncompleteDialogOpen(true);
    } else {
      setStep(stepCountrySummary);
    }
  }, [rowsIncompleteGeoForCountryStep, setStep, stepCountrySummary]);

  const teamInitiativeIds = useMemo(() => new Set(filteredData.map((r) => r.id)), [filteredData]);

  const handleRequestDeleteQuickSessionRow = useCallback(
    (id: string) => {
      if (!onDeleteInitiativeAddedInQuickFlow) return;
      if (!teamInitiativeIds.has(id)) return;
      setQuickSessionDeleteConfirmId(id);
    },
    [onDeleteInitiativeAddedInQuickFlow, teamInitiativeIds]
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

  const canProceedToStep2 =
    fillQuarters.length > 0 &&
    allTargetsInCatalog &&
    allEffortsValid &&
    filteredData.length > 0;

  const handleLeaveTreemapToTimeline = useCallback(() => {
    setStep(stepTimeline);
  }, [setStep, stepTimeline]);

  const requestGoToTreemapStep = useCallback(async () => {
    if (!canProceedToStep2) return;
    try {
      await onPersistPreviewCostsBeforeTimeline?.();
      setStep(stepTreemap);
    } catch {
      /* ошибка уже в toast на родителе */
    }
  }, [canProceedToStep2, onPersistPreviewCostsBeforeTimeline, setStep, stepTreemap]);

  const handleQuickFlowStepBack = useCallback(() => {
    onFlowStepBack?.();
  }, [onFlowStepBack]);

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
        {step === stepCoeff ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5 self-start sm:mt-0 max-w-[min(100%,280px)]">
            {validationRepairStep === stepCoeff ? (
              <QuickFlowBackToValidationButton
                onClick={() => setStep(stepValidation)}
                className="w-full shrink-0 sm:mt-0 sm:w-auto sm:max-w-[min(100%,20rem)]"
              />
            ) : !treemapCompareOpen ? (
              <Button
                type="button"
                size="sm"
                className="h-8 w-full shrink-0 gap-1.5 sm:mt-0 sm:w-auto"
                disabled={
                  isSavingQuickDraft ||
                  matrixCatalogQuarters.length === 0 ||
                  (filteredData.length === 0 && !onQuickAddInitiativeRow)
                }
                title="Открыть сравнение treemap по всем кварталам выгрузки в матрице"
                onClick={() => setTreemapCompareOpen(true)}
              >
                <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                Сравнение treemap
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-8 w-full shrink-0 gap-1.5 sm:mt-0 sm:w-auto"
                disabled={!canProceedToStep2 || isSavingQuickDraft}
                title="Сохранить предварительные суммы по коэффициентам в базу и перейти к проверке описания"
                onClick={() => void requestGoToTreemapStep()}
              >
                {isSavingQuickDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  <>
                    Далее
                    <ChevronRight size={15} className="shrink-0" aria-hidden />
                  </>
                )}
              </Button>
            )}
            {treemapCompareOpen ? (
              <span className="text-[10px] leading-tight text-muted-foreground text-right">
                Сохранить предварительные суммы по коэффициентам
              </span>
            ) : null}
          </div>
        ) : null}
        {step === stepTreemap ? (
          validationRepairStep === stepTreemap ? (
            <QuickFlowBackToValidationButton
              onClick={() => setStep(stepValidation)}
              className="max-w-[min(100%,20rem)] shrink-0 self-start sm:mt-0"
            />
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
              title="Перейти к заполнению по кварталам (суммы по коэффициентам уже сохранены на предыдущем шаге)"
              onClick={handleLeaveTreemapToTimeline}
            >
              Далее
              <ChevronRight size={15} className="shrink-0" aria-hidden />
            </Button>
          )
        ) : null}
        {step === stepTimeline ? (
          validationRepairStep === stepTimeline ? (
            <QuickFlowBackToValidationButton
              onClick={() => setStep(stepValidation)}
              className="max-w-[min(100%,20rem)] shrink-0 self-start sm:mt-0"
            />
          ) : (
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
          )
        ) : null}
        {step === stepCountrySplit ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5 self-start sm:mt-0 max-w-[min(100%,280px)]">
            {validationRepairStep === stepCountrySplit ? (
              <QuickFlowBackToValidationButton
                onClick={() => setStep(stepValidation)}
                className="w-full shrink-0 sm:w-auto sm:max-w-[min(100%,20rem)]"
              />
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-full gap-1.5 sm:w-auto"
                  title="Перейти к сводке по аллокациям"
                  onClick={requestProceedToCountrySummary}
                >
                  Далее
                  <ChevronRight size={15} className="shrink-0" aria-hidden />
                </Button>
                <span className="text-[10px] leading-tight text-muted-foreground text-right">
                  Посмотреть сводку по аллокациям
                </span>
              </>
            )}
          </div>
        ) : null}
        {step === stepCountrySummary ? (
          validationRepairStep === stepCountrySummary ? (
            <QuickFlowBackToValidationButton
              onClick={() => setStep(stepValidation)}
              className="max-w-[min(100%,20rem)] shrink-0 self-start sm:mt-0"
            />
          ) : (
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
          )
        ) : null}
      </div>
    </div>
  );

  const renderStep1Body = () => (
    <>
            <header
              className={cn(
                'shrink-0 gap-2 sm:flex sm:items-start sm:justify-between',
                treemapCompareOpen && 'pl-0.5'
              )}
            >
              <div className="min-w-0 space-y-1">
                <h1
                  className={cn(
                    'font-juneau text-balance font-medium tracking-tight',
                    treemapCompareOpen
                      ? 'text-lg font-medium sm:text-xl'
                      : 'text-xl sm:text-2xl'
                  )}
                >
                  Актуализируй коэффициенты
                </h1>
                <p className="max-w-prose text-sm text-muted-foreground">
                  Поменяй коэффициенты усилий и посмотри, как изменится ваш тримап
                </p>
              </div>
              {peopleEffortFillTo ? (
                <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
                  <Link to={peopleEffortFillTo}>По людям</Link>
                </Button>
              ) : null}
            </header>
            <section
              className={cn(
                'mx-auto w-full',
                treemapCompareOpen
                  ? 'flex min-h-0 max-w-none flex-1 flex-col rounded-none border-0 bg-transparent px-0 py-1 shadow-none sm:py-1.5'
                  : 'flex min-h-0 max-w-6xl flex-1 flex-col rounded-xl border border-border bg-card p-3 sm:p-4'
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
              ) : matrixCatalogQuarters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  В выгрузке нет колонок кварталов 2025–2026 для таблицы. Проверьте импорт и загрузку выгрузки.
                </p>
              ) : onQuickAddInitiativeRow || filteredData.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 pt-1">
                  {onQuickAddInitiativeRow && filteredData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Нет инициатив — нажмите + в заголовке колонки «Инициатива».
                    </p>
                  ) : null}
                  <EffortMatrixInline
                    visibleQuarters={matrixVisibleQuarters}
                    filteredData={filteredData}
                    onQuarterDataChange={onQuarterDataChange}
                    splitImmersive={treemapCompareOpen}
                    compactPeriodPicker
                    hideAddInitiativeButton={Boolean(onQuickAddInitiativeRow)}
                    onHeaderAddInitiativeRow={onQuickAddInitiativeRow}
                    onInitiativeNameChange={
                      onInitiativeDraftChange
                        ? (id, name) => onInitiativeDraftChange(id, 'initiative', name)
                        : undefined
                    }
                    focusInitiativeId={focusMatrixInitiativeId}
                    onFocusInitiativeConsumed={onFocusMatrixInitiativeConsumed}
                    quickSessionDeletableIds={
                      onDeleteInitiativeAddedInQuickFlow ? teamInitiativeIds : undefined
                    }
                    onRequestDeleteQuickSessionRow={
                      onDeleteInitiativeAddedInQuickFlow
                        ? handleRequestDeleteQuickSessionRow
                        : undefined
                    }
                    chipToolbar={matrixToolbarConfig}
                  />
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  <p>Нет инициатив. Добавьте первую кнопкой выше.</p>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenAddInitiative ?? noopAddInitiative}>
                    <Plus size={14} aria-hidden />
                    Добавить инициативу
                  </Button>
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
          : step === stepTreemap ||
              step === stepTimeline ||
              step === stepCountrySplit ||
              step === stepCountrySummary
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
            step === stepCountrySummary ||
            step === stepValidation ||
            step === stepSheets) &&
            'flex min-h-0 min-w-0 flex-1 flex-col gap-5',
          rosterStep !== null && step === rosterStep && 'overflow-hidden'
        )}
      >
        {step === stepCoeff && treemapCompareOpen ? (
          <>
            <div className="shrink-0 min-w-0 w-full">{trackRow}</div>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(272px,44%)_minmax(0,1fr)] lg:items-stretch">
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
                previewQuarters={matrixVisibleQuarters}
                immersive
                className="min-h-[320px] lg:min-h-0"
                onCloseComparison={() => setTreemapCompareOpen(false)}
              />
            </div>
          </>
        ) : null}
        {step === stepCoeff ? (
          <AdminQuickFlowEffortMascot rows={filteredData} visibleQuarterKeys={matrixVisibleQuarters} />
        ) : null}
        {!(step === stepCoeff && treemapCompareOpen) ? (
          <>
            {trackRow}
            {rosterStep !== null && step === rosterStep ? (
              <AdminQuickFlowRosterStep unit={unit} team={team} quartersCatalog={quarters} />
            ) : null}
            {step === stepCoeff ? renderStep1Body() : null}
            {step === stepTreemap ? (
              <AdminQuickFlowReviewTreemapStep
                rows={filteredData}
                fillQuarters={fillQuarters}
                quartersCatalog={matrixCatalogQuarters}
                visibleQuarters={matrixVisibleQuarters}
                onInitiativeDraftChange={onInitiativeDraftChange}
              />
            ) : null}
            {step === stepTimeline ? (
              <AdminQuickFlowTimelineFillStep
                rows={filteredData}
                fillQuarters={fillQuarters}
                quartersCatalog={matrixCatalogQuarters}
                visibleQuarters={matrixVisibleQuarters}
                previewQuarters={matrixPreviewQuarters}
                rangeAnchor={matrixRangeAnchor}
                onQuarterClick={handleMatrixQuarterClick}
                onQuarterHover={handleMatrixQuarterHover}
                onReplaceSelectedQuarters={handleMatrixReplaceQuarters}
                onDismissTransientRangeUI={handleMatrixDismissRangeUI}
                unit={unit}
                team={team}
                onQuarterDataChange={onQuarterDataChange}
              />
            ) : null}
            {step === stepCountrySplit ? (
              marketCountries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Загрузка справочника стран…</p>
              ) : (
                <AdminQuickFlowCountrySplitStep
                  rows={filteredData}
                  fillQuarters={fillQuarters}
                  countries={marketCountries}
                  onGeoChange={onGeoCostSplitDraftChange}
                />
              )
            ) : null}
            {step === stepCountrySummary ? (
              marketCountries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Загрузка справочника стран…</p>
              ) : (
                <AdminQuickFlowCountryAllocationsSummary
                  rows={filteredData}
                  fillQuarters={fillQuarters}
                  quartersCatalog={matrixCatalogQuarters}
                  countries={marketCountries}
                  visibleQuarters={matrixVisibleQuarters}
                  previewQuarters={matrixPreviewQuarters}
                  rangeAnchor={matrixRangeAnchor}
                  onQuarterClick={handleMatrixQuarterClick}
                  onQuarterHover={handleMatrixQuarterHover}
                  onReplaceSelectedQuarters={handleMatrixReplaceQuarters}
                  onDismissTransientRangeUI={handleMatrixDismissRangeUI}
                />
              )
            ) : null}
            {step === stepValidation ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
                <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
                  <AdminQuickFlowValidationStep
                    rows={filteredData}
                    fillQuarters={fillQuarters}
                    unit={unit}
                    team={team}
                    marketCountries={marketCountries}
                    onQuarterDataChange={onQuarterDataChange}
                    onGeoCostSplitDraftChange={onGeoCostSplitDraftChange}
                    onInitiativeDraftChange={onInitiativeDraftChange}
                    onNavigateToCoefficients={() => jumpToStepFromValidation(stepCoeff)}
                    onNavigateToTreemap={() => jumpToStepFromValidation(stepTreemap)}
                    onNavigateToTimeline={() => jumpToStepFromValidation(stepTimeline)}
                    onNavigateToGeoSplit={() => jumpToStepFromValidation(stepCountrySplit)}
                  />

                  {SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION &&
                    enableSheetsPreviewStep &&
                    runSheetsPreviewCalculation && (
                      <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
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
                            Есть замечания по полям — расчёт всё равно доступен; при необходимости заполните их позже после
                            сохранения.
                          </p>
                        )}
                      </div>
                    )}

                  {onSaveAndContinueQueue ? (
                    <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
                      <Button
                        className="gap-1.5 w-full sm:w-auto"
                        disabled={queueActionLoading}
                        onClick={() => void onSaveAndContinueQueue()}
                      >
                        {queueActionLoading || isSavingQuickDraft
                          ? 'Сохранение…'
                          : queueProgress && queueProgress.current < queueProgress.total
                            ? 'Сохранить и перейти к следующей команде'
                            : 'Сохранить и завершить'}
                      </Button>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
            {step === stepSheets ? (
          <section className="rounded-xl border border-border bg-card p-6 max-w-5xl space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Calculator size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Предварительный расчёт (лист OUT)</h2>
              </div>
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

      <Dialog
        open={quickSessionDeleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open && !quickSessionDeleteLoading) setQuickSessionDeleteConfirmId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => {
            if (quickSessionDeleteLoading) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (quickSessionDeleteLoading) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Удалить инициативу?</DialogTitle>
            <DialogDescription>
              Вы точно хотите удалить инициативу «{quickSessionDeleteRowLabel}»?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={quickSessionDeleteLoading}
              onClick={() => setQuickSessionDeleteConfirmId(null)}
            >
              Отмена
            </Button>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={countrySplitIncompleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) setCountrySplitIncompleteDialogOpen(false);
        }}
      >
        <AlertDialogContent className="flex max-h-[min(90vh,520px)] flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Распредели по странам стоимость инициативы</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>Не заполнена аллокация по странам (кварталы интервала с затратами):</p>
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-foreground">
                  {rowsIncompleteGeoForCountryStep.map((row) => (
                    <li key={row.id}>{row.initiative?.trim() || '—'}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" className="mt-0 sm:mt-0">
              Вернуться и заполнить
            </AlertDialogCancel>
            <Button type="button" onClick={proceedToCountrySummary}>
              Далее: сводка по аллокациям
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
