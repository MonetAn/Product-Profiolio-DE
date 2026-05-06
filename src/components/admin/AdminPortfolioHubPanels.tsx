import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { EffortMatrixInline } from '@/components/admin/AdminQuickFlow';
import { AdminQuickFlowEffortComparePanel } from '@/components/admin/AdminQuickFlowEffortComparePanel';
import { AdminQuickFlowEffortMascot } from '@/components/admin/AdminQuickFlowEffortMascot';
import { AdminQuickFlowReviewTreemapStep } from '@/components/admin/AdminQuickFlowReviewTreemapStep';
import type { DraftField } from '@/components/admin/AdminQuickFlowReviewTreemapStep';
import { AdminQuickFlowTimelineFillStep } from '@/components/admin/AdminQuickFlowTimelineFillStep';
import { AdminQuickFlowCountrySplitStep } from '@/components/admin/AdminQuickFlowCountrySplitStep';
import { AdminQuickFlowRosterStep } from '@/components/admin/AdminQuickFlowRosterStep';
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
import type { AdminDataRow, AdminQuarterData, GeoCostSplit } from '@/lib/adminDataManager';
import { effortMatrixColumnChipState, hasInitiativeEffortOrCostInYear } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { compareQuarters, filterQuartersInRange, getCurrentQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

const YEAR_2025_KEYS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'] as const;
const YEAR_2026_KEYS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;
const MATRIX_TABLE_QUARTER_KEYS = new Set<string>([...YEAR_2025_KEYS, ...YEAR_2026_KEYS]);

export type PortfolioHubPanel =
  | 'roster'
  | 'coefficients'
  | 'descriptions'
  | 'planFact'
  | 'geo'
  | null;

export type PortfolioHubBlock = Exclude<PortfolioHubPanel, 'roster' | null>;

const BLOCK_FLOW: PortfolioHubBlock[] = ['coefficients', 'descriptions', 'planFact', 'geo'];

export function nextHubBlock(current: PortfolioHubBlock): PortfolioHubBlock | null {
  const i = BLOCK_FLOW.indexOf(current);
  if (i < 0 || i >= BLOCK_FLOW.length - 1) return null;
  return BLOCK_FLOW[i + 1] ?? null;
}

/** Подпись для кнопки «Далее: …»; для последнего шага потока вернётся null — показывают «К обзору». */
export function nextNavCaption(open: PortfolioHubPanel): string | null {
  if (open === 'roster') return 'коэффициенты';
  if (open === 'coefficients') return 'описания';
  if (open === 'descriptions') return 'план и факт';
  if (open === 'planFact') return 'рынки';
  return null;
}

type MatrixChip = {
  quarter: string;
  sum: number;
  nonStubSum: number;
  valid: boolean;
  inCatalog: boolean;
};

function effortStatesForQuarters(
  quarterKeys: string[],
  rows: AdminDataRow[],
  catalogQuarters: string[]
): MatrixChip[] {
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

type Props = {
  open: PortfolioHubPanel;
  onOpenChange: (p: PortfolioHubPanel) => void;
  filteredData: AdminDataRow[];
  quarters: string[];
  fillQuarters: string[];
  /** Ссылка на черновик экрана усилий по людям (те же query, что у портфеля). */
  peopleEffortFillTo?: string;
  unit: string;
  team: string;
  marketCountries: MarketCountryRow[];
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | undefined
  ) => void;
  onInitiativeFieldChange: (id: string, field: keyof AdminDataRow, value: string | string[] | number | boolean) => void;
  onInitiativeGeoCostSplitChange: (id: string, split: GeoCostSplit | undefined) => void;
  onAddInitiativeFromMatrix: () => void | Promise<void>;
  /** Удаление строки из матрицы коэффициентов (подтверждение внутри панели). */
  onDeleteInitiativeFromMatrix?: (id: string) => void | Promise<void>;
};

/** Состояние чипов кварталов для матриц и сводки аллокаций на обзоре хаба. */
export function usePortfolioHubMatrixToolbar(
  filteredData: AdminDataRow[],
  quarters: string[],
  fillQuarters: string[]
) {
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
      if (filtered.length > 0) return filtered;
      /**
       * Дефолт пикера — кварталы текущего календарного года, что есть в каталоге.
       * Так инфографика и колонки матрицы по умолчанию не тянут прошлые годы (2025),
       * пока пользователь сам не выберет более широкий диапазон.
       */
      const m = getCurrentQuarter().match(/^(\d{4})/);
      const currentYear = m ? Number(m[1]) : new Date().getFullYear();
      const currentYearQs = cat.filter((q) => q.startsWith(`${currentYear}-Q`));
      return currentYearQs.length > 0 ? currentYearQs : [...cat];
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

  /**
   * Пока state кварталов ещё [] (до первого useEffect), используем дефолт «текущий календарный год»,
   * чтобы первый кадр не показывал прошлые года и не было «мигания» 2025 в инфографике/treemap.
   */
  const matrixVisibleQuarters = useMemo(() => {
    let effectiveSelected: string[];
    if (matrixSelectedQuarters.length > 0) {
      effectiveSelected = matrixSelectedQuarters;
    } else {
      const m = getCurrentQuarter().match(/^(\d{4})/);
      const currentYear = m ? Number(m[1]) : new Date().getFullYear();
      const currentYearQs = matrixCatalogQuarters.filter((q) => q.startsWith(`${currentYear}-Q`));
      effectiveSelected = currentYearQs.length > 0 ? currentYearQs : matrixCatalogQuarters;
    }
    const sel = new Set(effectiveSelected);
    return matrixCatalogQuarters.filter((q) => sel.has(q));
  }, [matrixCatalogQuarters, matrixSelectedQuarters]);

  const matrixChipStates = useMemo(
    () => effortStatesForQuarters(matrixCatalogQuarters, filteredData, quarters),
    [matrixCatalogQuarters, filteredData, quarters]
  );

  const chipToolbar = useMemo(
    () => ({
      catalogQuarters: matrixCatalogQuarters,
      previewQuarters: matrixPreviewQuarters,
      rangeAnchor: matrixRangeAnchor,
      chipStates: matrixChipStates,
      onQuarterClick: handleMatrixQuarterClick,
      onQuarterHover: handleMatrixQuarterHover,
      onOpenAddInitiative: () => {},
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
    ]
  );

  return {
    matrixCatalogQuarters,
    matrixVisibleQuarters,
    chipToolbar,
  };
}

export function AdminPortfolioHubPanels({
  open,
  onOpenChange,
  filteredData,
  quarters,
  fillQuarters,
  peopleEffortFillTo,
  unit,
  team,
  marketCountries,
  onQuarterDataChange,
  onInitiativeFieldChange,
  onInitiativeGeoCostSplitChange,
  onAddInitiativeFromMatrix,
  onDeleteInitiativeFromMatrix,
}: Props) {
  /**
   * Матрица коэффициентов: видны строки с effort > 0 или cost > 0 в текущем году, плюс заглушки команды
   * и свежесозданные в сессии. При смене unit+team фиксируем список «квалифицированных»
   * id и держим его до следующей смены scope: при редактировании можно временно стереть все
   * коэффициенты у инициативы — она не пропадёт. После перезахода/смены команды список
   * пересчитывается из реальных данных (это и есть «архивация» прошлогодних — костыль до
   * системного решения).
   */
  const currentCalendarYear = useMemo(() => {
    const m = getCurrentQuarter().match(/^(\d{4})/);
    return m ? Number(m[1]) : new Date().getFullYear();
  }, []);

  const scopeKey = `${unit}\u0000${team}`;
  const [stickyMatrixIds, setStickyMatrixIds] = useState<{
    key: string;
    ids: Set<string>;
  } | null>(null);

  useEffect(() => {
    if (filteredData.length === 0) return;
    if (stickyMatrixIds?.key === scopeKey) return;
    const ids = new Set<string>();
    for (const r of filteredData) {
      if (hasInitiativeEffortOrCostInYear(r, currentCalendarYear)) ids.add(r.id);
    }
    setStickyMatrixIds({ key: scopeKey, ids });
  }, [filteredData, scopeKey, currentCalendarYear, stickyMatrixIds]);

  const coeffMatrixData = useMemo(() => {
    const sticky =
      stickyMatrixIds?.key === scopeKey ? stickyMatrixIds.ids : null;
    return filteredData.filter(
      (r) =>
        r.isNew ||
        r.isTimelineStub ||
        hasInitiativeEffortOrCostInYear(r, currentCalendarYear) ||
        (sticky?.has(r.id) ?? false)
    );
  }, [filteredData, currentCalendarYear, stickyMatrixIds, scopeKey]);

  const coeffMatrixMatchesScope = useMemo(() => {
    const u = (unit ?? '').trim();
    const t = (team ?? '').trim();
    if (coeffMatrixData.length === 0) return true;
    return coeffMatrixData.every((r) => {
      const ru = (r.unit ?? '').trim();
      const rt = (r.team ?? '').trim();
      return (!u || ru === u) && (!t || rt === t);
    });
  }, [coeffMatrixData, unit, team]);

  const coeffBaselineRef = useRef<AdminDataRow[] | null>(null);
  const prevOpenForCoeffRef = useRef<PortfolioHubPanel>(null);
  useEffect(() => {
    coeffBaselineRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (open === 'coefficients' && prevOpenForCoeffRef.current !== 'coefficients') {
      /**
       * Сбрасываем baseline при входе в панель и берём снимок чуть позже, когда данные матрицы уже
       * стабилизировались (после возможной подгрузки черновика/инициализации фильтра).
       * Иначе «До изменений» может зафиксироваться пустым.
       */
      coeffBaselineRef.current = null;
    }
    prevOpenForCoeffRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open !== 'coefficients') return;
    if (coeffBaselineRef.current !== null) return;
    if (coeffMatrixData.length === 0) return;
    if (!coeffMatrixMatchesScope) return;
    coeffBaselineRef.current = structuredClone(coeffMatrixData);
  }, [open, coeffMatrixData, coeffMatrixMatchesScope]);

  useEffect(() => {
    if (open === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const { matrixCatalogQuarters, matrixVisibleQuarters, chipToolbar } = usePortfolioHubMatrixToolbar(
    filteredData,
    quarters,
    fillQuarters
  );

  /** По умолчанию сравнение treemap включено; снимается только крестиком, затем доступна кнопка внизу. */
  const [treemapCompareOpen, setTreemapCompareOpen] = useState(true);
  const prevHubPanelRef = useRef<PortfolioHubPanel | null>(null);
  const [matrixDeleteConfirmId, setMatrixDeleteConfirmId] = useState<string | null>(null);
  const [matrixDeleteLoading, setMatrixDeleteLoading] = useState(false);
  useEffect(() => {
    const prev = prevHubPanelRef.current;
    prevHubPanelRef.current = open;
    if (open !== 'coefficients') {
      setTreemapCompareOpen(false);
    } else if (prev !== null && prev !== 'coefficients') {
      setTreemapCompareOpen(true);
    }
  }, [open]);

  const matrixDeletableIds = useMemo(
    () =>
      onDeleteInitiativeFromMatrix
        ? new Set(coeffMatrixData.filter((r) => !r.isTimelineStub).map((r) => r.id))
        : undefined,
    [onDeleteInitiativeFromMatrix, coeffMatrixData]
  );

  const matrixDeleteRowLabel = useMemo(() => {
    if (!matrixDeleteConfirmId) return '';
    return coeffMatrixData.find((r) => r.id === matrixDeleteConfirmId)?.initiative?.trim() || '—';
  }, [matrixDeleteConfirmId, coeffMatrixData]);

  const handleRequestMatrixDelete = useCallback(
    (id: string) => {
      if (!onDeleteInitiativeFromMatrix) return;
      if (!matrixDeletableIds?.has(id)) return;
      setMatrixDeleteConfirmId(id);
    },
    [onDeleteInitiativeFromMatrix, matrixDeletableIds]
  );

  const confirmMatrixDelete = useCallback(async () => {
    const id = matrixDeleteConfirmId;
    if (!id || !onDeleteInitiativeFromMatrix) return;
    setMatrixDeleteLoading(true);
    try {
      await onDeleteInitiativeFromMatrix(id);
      setMatrixDeleteConfirmId(null);
    } finally {
      setMatrixDeleteLoading(false);
    }
  }, [matrixDeleteConfirmId, onDeleteInitiativeFromMatrix]);

  const onReviewDraftChange = useCallback(
    (id: string, field: DraftField, value: string | string[] | boolean) => {
      const map: Partial<Record<DraftField, keyof AdminDataRow>> = {
        initiative: 'initiative',
        stakeholdersList: 'stakeholdersList',
        description: 'description',
        documentationLink: 'documentationLink',
        isTimelineStub: 'isTimelineStub',
      };
      const key = map[field];
      if (!key) return;
      onInitiativeFieldChange(id, key, value as never);
    },
    [onInitiativeFieldChange]
  );

  const onGeoChange = useCallback(
    (initiativeId: string, split: GeoCostSplit | undefined) => {
      onInitiativeGeoCostSplitChange(initiativeId, split);
    },
    [onInitiativeGeoCostSplitChange]
  );

  const quarterEffortStates = useMemo(() => {
    return fillQuarters.map((targetQ) => {
      const sum = coeffMatrixData.reduce(
        (s, row) =>
          row.isTimelineStub ? s : s + (row.quarterlyData[targetQ]?.effortCoefficient ?? 0),
        0
      );
      return { quarter: targetQ, sum, valid: sum <= 100, inCatalog: quarters.includes(targetQ) };
    });
  }, [coeffMatrixData, fillQuarters, quarters]);

  const allTargetsInCatalog =
    fillQuarters.length > 0 && quarterEffortStates.every((s) => s.inCatalog);
  const allEffortsValid = quarterEffortStates.every((s) => s.valid);
  const canProceedCoeffMeta =
    fillQuarters.length > 0 && allTargetsInCatalog && allEffortsValid && coeffMatrixData.length > 0;

  const coeffMatrixOnly = (
      <section
        className={cn(
          'mx-auto flex min-h-0 w-full flex-1 flex-col',
          treemapCompareOpen ? 'rounded-none border-0 bg-transparent p-1' : 'gap-2'
        )}
      >
        {fillQuarters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет кварталов в выгрузке для интервала.</p>
        ) : !allTargetsInCatalog ? (
          <p className="text-sm text-muted-foreground">
            Для части кварталов интервала нет колонок в текущей выгрузке.
          </p>
        ) : matrixCatalogQuarters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет колонок кварталов для таблицы коэффициентов.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 pt-1">
            {peopleEffortFillTo ? (
              <div className="flex shrink-0 justify-end">
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <Link to={peopleEffortFillTo}>По людям</Link>
                </Button>
              </div>
            ) : null}
            {coeffMatrixData.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Нет инициатив — нажмите + в заголовке колонки «Инициатива».
              </p>
            ) : null}
            <EffortMatrixInline
              visibleQuarters={matrixVisibleQuarters}
              filteredData={coeffMatrixData}
              onQuarterDataChange={onQuarterDataChange}
              splitImmersive={treemapCompareOpen}
              compactPeriodPicker
              chipToolbar={chipToolbar}
              onHeaderAddInitiativeRow={onAddInitiativeFromMatrix}
              onInitiativeNameChange={(id, name) => onInitiativeFieldChange(id, 'initiative', name)}
              quickSessionDeletableIds={matrixDeletableIds}
              onRequestDeleteQuickSessionRow={
                onDeleteInitiativeFromMatrix ? handleRequestMatrixDelete : undefined
              }
            />
          </div>
        )}
      </section>
  );

  const coeffMascot = (
    <AdminQuickFlowEffortMascot rows={coeffMatrixData} visibleQuarterKeys={matrixVisibleQuarters} />
  );

  const showCoeffTreemapFooter =
    open === 'coefficients' &&
    !treemapCompareOpen &&
    matrixCatalogQuarters.length > 0 &&
    coeffMatrixData.length > 0;

  if (open === null) return null;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Заполнение блока портфеля"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 lg:px-8">
          {open === 'roster' ? (
            <AdminQuickFlowRosterStep unit={unit} team={team} quartersCatalog={quarters} compactChrome />
          ) : null}

          {open === 'coefficients' && treemapCompareOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
              <div
                className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(272px,44%)_minmax(0,1fr)] lg:items-stretch lg:min-h-0 min-h-[min(480px,calc(100dvh-13rem))]"
              >
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border/60 bg-muted/15 pr-2 dark:bg-muted/10 lg:border-r lg:pr-3">
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {coeffMatrixOnly}
                  </div>
                </div>
                <AdminQuickFlowEffortComparePanel
                  baselineRows={coeffBaselineRef.current ?? coeffMatrixData}
                  currentRows={coeffMatrixData}
                  previewQuarters={matrixVisibleQuarters}
                  immersive
                  className="min-w-0 min-h-[280px] lg:min-h-0"
                  onCloseComparison={() => setTreemapCompareOpen(false)}
                />
              </div>
              {coeffMascot}
            </div>
          ) : null}

          {open === 'coefficients' && !treemapCompareOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {coeffMatrixOnly}
              </div>
              <div className="shrink-0">{coeffMascot}</div>
            </div>
          ) : null}

          {open === 'descriptions' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <AdminQuickFlowReviewTreemapStep
                rows={filteredData}
                fillQuarters={fillQuarters}
                quartersCatalog={matrixCatalogQuarters}
                visibleQuarters={matrixVisibleQuarters}
                onInitiativeDraftChange={onReviewDraftChange}
                compactChrome
              />
            </div>
          ) : null}

          {open === 'planFact' ? (
            <AdminQuickFlowTimelineFillStep
              rows={filteredData}
              fillQuarters={fillQuarters}
              quartersCatalog={matrixCatalogQuarters}
              visibleQuarters={matrixVisibleQuarters}
              previewQuarters={chipToolbar.previewQuarters}
              rangeAnchor={chipToolbar.rangeAnchor}
              onQuarterClick={chipToolbar.onQuarterClick}
              onQuarterHover={chipToolbar.onQuarterHover}
              onReplaceSelectedQuarters={chipToolbar.onReplaceSelectedQuarters}
              onDismissTransientRangeUI={chipToolbar.onDismissTransientRangeUI}
              unit={unit}
              team={team}
              onQuarterDataChange={onQuarterDataChange}
              compactChrome
            />
          ) : null}

          {open === 'geo' ? (
            <div className="flex min-h-0 w-full flex-col gap-4 pb-1">
              {marketCountries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Загрузка справочника стран…</p>
              ) : (
                <AdminQuickFlowCountrySplitStep
                  rows={filteredData}
                  fillQuarters={fillQuarters}
                  countries={marketCountries}
                  onGeoChange={onGeoChange}
                  compactChrome
                />
              )}
            </div>
          ) : null}
        </div>

      <AlertDialog
        open={matrixDeleteConfirmId !== null}
        onOpenChange={(openDlg) => {
          if (!openDlg && !matrixDeleteLoading) setMatrixDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить инициативу?</AlertDialogTitle>
            <AlertDialogDescription>
              Строка «{matrixDeleteRowLabel}» будет удалена из базы. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={matrixDeleteLoading}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={matrixDeleteLoading}
              onClick={(e) => {
                e.preventDefault();
                void confirmMatrixDelete();
              }}
            >
              {matrixDeleteLoading ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showCoeffTreemapFooter ? (
        <footer className="shrink-0 border-t border-border bg-muted/25 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!canProceedCoeffMeta}
              title="Показать сравнение treemap по выбранным кварталам"
              onClick={() => setTreemapCompareOpen(true)}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              Сравнение treemap
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
