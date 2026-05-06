import { useCallback, useMemo, useState } from 'react';
import { LayoutGrid, MapPin } from 'lucide-react';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  type AdminDataRow,
  type AdminQuarterData,
  type GeoCostSplit,
  createEmptyQuarterData,
  getMissingInitiativeFields,
  getQuickFlowCellReadiness,
  isGeoCostSplitCompleteForCost,
  type QuickFlowReadinessLevel,
  quarterRequiresPlanFact,
  validateTeamQuarterEffort,
} from '@/lib/adminDataManager';
import { compareQuarters, isPortfolioMandatoryMetricFactQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

type DraftField =
  | 'initiative'
  | 'description'
  | 'documentationLink'
  | 'isTimelineStub';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  unit: string;
  team: string;
  marketCountries: MarketCountryRow[];
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | undefined
  ) => void;
  onGeoCostSplitDraftChange: (initiativeId: string, split: GeoCostSplit | undefined) => void;
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
  onNavigateToCoefficients: () => void;
  onNavigateToTimeline: () => void;
  onNavigateToGeoSplit: () => void;
  onNavigateToTreemap: () => void;
};

const LEVEL_CELL: Record<Exclude<QuickFlowReadinessLevel, 'na'>, string> = {
  ok: 'bg-emerald-600/90 text-white border-emerald-700/50',
  warn: 'bg-rose-600/90 text-white border-rose-700/50',
  blocker: 'bg-rose-600/90 text-white border-rose-700/50',
};

function mergeQuarterData(row: AdminDataRow, quarter: string): AdminQuarterData {
  return {
    ...createEmptyQuarterData(),
    ...row.quarterlyData[quarter],
  };
}

type CellSelection = { rowId: string; quarter: string };

export function AdminQuickFlowValidationStep({
  rows,
  fillQuarters,
  unit,
  team,
  marketCountries,
  onQuarterDataChange,
  onGeoCostSplitDraftChange,
  onInitiativeDraftChange,
  onNavigateToCoefficients,
  onNavigateToTimeline,
  onNavigateToGeoSplit,
  onNavigateToTreemap,
}: Props) {
  const sortedQuarters = useMemo(() => [...fillQuarters].filter(Boolean).sort(compareQuarters), [fillQuarters]);

  const matrix = useMemo(() => {
    return rows.map((row) => {
      const cells = sortedQuarters.map((q) => ({
        quarter: q,
        readiness: getQuickFlowCellReadiness(row, q),
      }));
      return { row, cells };
    });
  }, [rows, sortedQuarters]);

  const counts = useMemo(() => {
    let ready = 0;
    let missing = 0;
    for (const { cells } of matrix) {
      for (const { readiness } of cells) {
        if (readiness.level === 'na') continue;
        if (readiness.level === 'ok') ready += 1;
        else missing += 1;
      }
    }
    return { ready, missing };
  }, [matrix]);

  const [selection, setSelection] = useState<CellSelection | null>(null);

  const selectedRow = useMemo(
    () => (selection ? rows.find((r) => r.id === selection.rowId) : undefined),
    [rows, selection]
  );

  const closeSheet = useCallback(() => setSelection(null), []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Проверка перед завершением</h2>
        <div className="flex flex-wrap items-stretch gap-2 text-sm">
          <div className="flex items-baseline gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1">
            <span className="text-muted-foreground">Проблемные</span>
            <span className="font-semibold tabular-nums text-rose-700 dark:text-rose-300">{counts.missing}</span>
          </div>
          <div className="flex items-baseline gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1">
            <span className="text-muted-foreground">Закрыто</span>
            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{counts.ready}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-auto max-h-[min(52vh,560px)] overscroll-contain">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-20 min-w-[10rem] max-w-[14rem] border-r border-border bg-muted/30 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Инициатива
                </th>
                {sortedQuarters.map((q) => (
                  <th
                    key={q}
                    className="min-w-[3rem] px-1 py-2 text-center text-xs font-semibold tabular-nums text-foreground"
                  >
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ row, cells }) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="sticky left-0 z-10 max-w-[14rem] border-r border-border bg-card px-2 py-1.5 align-middle">
                    <span className="line-clamp-2 font-medium leading-snug text-foreground" title={row.initiative || '—'}>
                      {row.initiative?.trim() || '—'}
                    </span>
                    {row.isTimelineStub ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">Заглушка</span>
                    ) : null}
                  </td>
                  {cells.map(({ quarter, readiness }) => (
                    <td key={quarter} className="p-0.5 align-middle text-center">
                      {row.isTimelineStub ? (
                        <div
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/30 text-[10px] text-muted-foreground"
                          title="Не редактируется"
                        >
                          —
                        </div>
                      ) : (
                        readiness.level === 'na' ? (
                          <div
                            className="mx-auto h-8 w-8 min-w-[2rem]"
                            aria-hidden
                          />
                        ) : readiness.level === 'ok' ? (
                          <button
                            type="button"
                            className={cn(
                              'mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums shadow-sm transition-colors hover:brightness-95',
                              LEVEL_CELL.ok
                            )}
                            title={`${quarter}: всё обязательное заполнено`}
                            aria-label={`${row.initiative || 'Инициатива'}, ${quarter}, заполнено`}
                            onClick={() => setSelection({ rowId: row.id, quarter })}
                          >
                            ✓
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={cn(
                              'mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums shadow-sm transition-colors hover:brightness-95',
                              LEVEL_CELL[readiness.level]
                            )}
                            title={`${quarter}: ${readiness.reasons.join(' · ')}`}
                            aria-label={`${row.initiative || 'Инициатива'}, ${quarter}, не заполнено обязательное`}
                            onClick={() => setSelection({ rowId: row.id, quarter })}
                          >
                            !
                          </button>
                        )
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={selection != null} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent
          side="right"
          className={cn(
            'flex flex-col gap-0 overflow-hidden p-0 shadow-xl',
            // Почти на весь экран, с небольшими полями — видно затемнённый фон сзади
            'rounded-xl',
            '!inset-2 !h-[calc(100vh-1rem)] !max-h-[calc(100vh-1rem)] !w-auto !max-w-none sm:!max-w-none',
            'md:!left-auto md:!right-2 md:!w-[min(96rem,calc(100vw-1rem))]'
          )}
        >
          {selectedRow && selection ? (
            <ValidationCellPanel
              row={selectedRow}
              quarter={selection.quarter}
              teamRows={rows}
              unit={unit}
              team={team}
              marketCountries={marketCountries}
              onQuarterDataChange={onQuarterDataChange}
              onGeoCostSplitDraftChange={onGeoCostSplitDraftChange}
              onInitiativeDraftChange={onInitiativeDraftChange}
              onNavigateToCoefficients={onNavigateToCoefficients}
              onNavigateToTimeline={onNavigateToTimeline}
              onNavigateToGeoSplit={onNavigateToGeoSplit}
              onNavigateToTreemap={onNavigateToTreemap}
              onClose={closeSheet}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ValidationCellPanel({
  row,
  quarter,
  teamRows,
  unit,
  team,
  marketCountries,
  onQuarterDataChange,
  onGeoCostSplitDraftChange,
  onInitiativeDraftChange,
  onNavigateToCoefficients,
  onNavigateToTimeline,
  onNavigateToGeoSplit,
  onNavigateToTreemap,
  onClose,
}: {
  row: AdminDataRow;
  quarter: string;
  teamRows: AdminDataRow[];
  unit: string;
  team: string;
  marketCountries: MarketCountryRow[];
  onQuarterDataChange: Props['onQuarterDataChange'];
  onGeoCostSplitDraftChange: Props['onGeoCostSplitDraftChange'];
  onInitiativeDraftChange?: Props['onInitiativeDraftChange'];
  onNavigateToCoefficients: () => void;
  onNavigateToTimeline: () => void;
  onNavigateToGeoSplit: () => void;
  onNavigateToTreemap: () => void;
  onClose: () => void;
}) {
  const qd = useMemo(() => mergeQuarterData(row, quarter), [row, quarter]);
  const effortTotal = useMemo(
    () => validateTeamQuarterEffort(teamRows, unit, team, quarter),
    [teamRows, unit, team, quarter]
  );
  const cardMissing = useMemo(() => getMissingInitiativeFields(row), [row]);
  const cost = qd.cost ?? 0;
  const geoIncomplete = cost > 0 && !isGeoCostSplitCompleteForCost(cost, row.initiativeGeoCostSplit);
  const planFactRequired = quarterRequiresPlanFact(qd);
  const factRequired = isPortfolioMandatoryMetricFactQuarter(quarter);

  return (
    <>
      <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-14 text-left">
        <SheetTitle className="text-base leading-snug pr-2">{row.initiative?.trim() || 'Инициатива'}</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{quarter}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-6">
        {onInitiativeDraftChange ? (
          <section className="space-y-1.5">
            <Label htmlFor={`qv-name-${row.id}`}>Название инициативы</Label>
            <Input
              id={`qv-name-${row.id}`}
              value={row.initiative ?? ''}
              onChange={(e) => onInitiativeDraftChange(row.id, 'initiative', e.target.value)}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Усилия в квартале</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => {
                onClose();
                onNavigateToCoefficients();
              }}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Вернуться к шагу
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`qv-eff-${row.id}-${quarter}`}>Усилия в квартале, %</Label>
            <Input
              id={`qv-eff-${row.id}-${quarter}`}
              type="number"
              min={0}
              max={100}
              className="max-w-[8rem] tabular-nums"
              value={qd.effortCoefficient ?? 0}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                onQuarterDataChange(row.id, quarter, 'effortCoefficient', Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Сумма по команде в этом квартале:{' '}
              <span className={cn('font-medium tabular-nums', effortTotal.isValid ? 'text-foreground' : 'text-red-600')}>
                {effortTotal.total}%
              </span>
              {!effortTotal.isValid ? ' — превышает 100%' : null}
            </p>
          </div>
        </section>

        {cardMissing.length > 0 && onInitiativeDraftChange ? (
          <section className="space-y-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Карточка инициативы</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  onClose();
                  onNavigateToTreemap();
                }}
              >
                Вернуться к шагу
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`qv-desc-${row.id}`}>Описание</Label>
              <Textarea
                id={`qv-desc-${row.id}`}
                rows={4}
                value={row.description ?? ''}
                onChange={(e) => onInitiativeDraftChange(row.id, 'description', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`qv-doc-${row.id}`}>Ссылка на документацию (необязательно)</Label>
              <Input
                id={`qv-doc-${row.id}`}
                value={row.documentationLink ?? ''}
                onChange={(e) => onInitiativeDraftChange(row.id, 'documentationLink', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </section>
        ) : null}

        {planFactRequired ? (
          <section
            className={cn(
              'space-y-3 rounded-lg border p-3',
              !qd.metricPlan?.trim() || (factRequired && !qd.metricFact?.trim())
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-border/80 bg-muted/10'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">План и факт метрики</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  onClose();
                  onNavigateToTimeline();
                }}
              >
                Вернуться к шагу
              </Button>
            </div>
            {qd.support ? (
              <p className="text-xs text-muted-foreground">Квартал на поддержке — по правилам план/факт не требуются.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`qv-plan-${row.id}-${quarter}`}>План</Label>
                  <Textarea
                    id={`qv-plan-${row.id}-${quarter}`}
                    rows={3}
                    value={qd.metricPlan ?? ''}
                    onChange={(e) => onQuarterDataChange(row.id, quarter, 'metricPlan', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`qv-fact-${row.id}-${quarter}`}>Факт</Label>
                  <Textarea
                    id={`qv-fact-${row.id}-${quarter}`}
                    rows={3}
                    value={qd.metricFact ?? ''}
                    onChange={(e) => onQuarterDataChange(row.id, quarter, 'metricFact', e.target.value)}
                    disabled={!factRequired}
                  />
                  {!factRequired ? (
                    <p className="text-xs text-muted-foreground">Для этого квартала факт по календарю пока не обязателен.</p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        ) : null}

        {cost > 0 ? (
          <section
            className={cn(
              'space-y-2 rounded-lg border p-3',
              geoIncomplete ? 'border-rose-500/25 bg-rose-500/5' : 'border-border/80 bg-muted/10'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Распределение по рынкам</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => {
                  onClose();
                  onNavigateToGeoSplit();
                }}
              >
                <MapPin className="h-3.5 w-3.5" />
                Вернуться к шагу
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Стоимость квартала:{' '}
              <span className="font-medium tabular-nums text-foreground">{Math.round(cost).toLocaleString('ru-RU')} ₽</span>
            </p>
            {marketCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Справочник стран загружается…</p>
            ) : (
              <GeoCostSplitEditor
                cost={cost}
                value={row.initiativeGeoCostSplit}
                countries={marketCountries}
                onChange={(next) => onGeoCostSplitDraftChange(row.id, next)}
                hideFooterCostLine
              />
            )}
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-6 py-3">
        <Button type="button" className="w-full" onClick={onClose}>
          Сохранить и закрыть
        </Button>
      </div>
    </>
  );
}
