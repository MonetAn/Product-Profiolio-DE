import { useCallback, useMemo, useState } from 'react';
import { LayoutGrid, MapPin, Pencil } from 'lucide-react';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  type AdminDataRow,
  type AdminQuarterData,
  type GeoCostSplit,
  createEmptyQuarterData,
  getMissingInitiativeFields,
  getQuickFlowCellReadiness,
  INITIATIVE_TYPES,
  isGeoCostSplitCompleteForCost,
  type InitiativeType,
  type QuickFlowReadinessLevel,
  quarterRequiresPlanFact,
  STAKEHOLDERS_LIST,
  validateTeamQuarterEffort,
} from '@/lib/adminDataManager';
import { compareQuarters, isMetricFactRequiredForQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

type DraftField =
  | 'initiative'
  | 'initiativeType'
  | 'stakeholdersList'
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
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
  onGeoCostSplitDraftChange: (initiativeId: string, quarter: string, split: GeoCostSplit | undefined) => void;
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
  onOpenFillInitiative?: (id: string) => void;
  onNavigateToCoefficients: () => void;
  onNavigateToTimeline: () => void;
  onNavigateToGeoSplit: () => void;
  onNavigateToTreemap: () => void;
};

const LEVEL_CELL: Record<QuickFlowReadinessLevel, string> = {
  na: 'bg-muted/55 text-muted-foreground border-border/60 hover:bg-muted/75',
  ok: 'bg-emerald-600/90 text-white border-emerald-700/50 hover:bg-emerald-600',
  warn: 'bg-amber-500/90 text-amber-950 border-amber-600/50 hover:bg-amber-500',
  blocker: 'bg-rose-600/90 text-white border-rose-700/50 hover:bg-rose-600',
};

const LEVEL_DOT: Record<QuickFlowReadinessLevel, string> = {
  na: 'bg-muted-foreground/35',
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  blocker: 'bg-rose-500',
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
  onOpenFillInitiative,
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
    let ok = 0;
    let warn = 0;
    let blocker = 0;
    let na = 0;
    for (const { cells } of matrix) {
      for (const { readiness } of cells) {
        if (readiness.level === 'ok') ok += 1;
        else if (readiness.level === 'warn') warn += 1;
        else if (readiness.level === 'blocker') blocker += 1;
        else na += 1;
      }
    }
    return { ok, warn, blocker, na, total: ok + warn + blocker + na };
  }, [matrix]);

  const [selection, setSelection] = useState<CellSelection | null>(null);

  const selectedRow = useMemo(
    () => (selection ? rows.find((r) => r.id === selection.rowId) : undefined),
    [rows, selection]
  );

  const closeSheet = useCallback(() => setSelection(null), []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Проверка перед завершением</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Матрица по инициативам и кварталам: зелёный — всё обязательное закрыто, жёлтый — план/факт, красный — карточка или
          гео по рынкам. Серый — в квартале нет усилий и стоимости. Нажмите ячейку, чтобы дозаполнить справа.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/15 px-3 py-2.5 text-xs">
        <span className="font-medium text-foreground">Ячейки:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', LEVEL_DOT.blocker)} />
          <span className="tabular-nums text-foreground">{counts.blocker}</span>
          <span className="text-muted-foreground">критично</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', LEVEL_DOT.warn)} />
          <span className="tabular-nums text-foreground">{counts.warn}</span>
          <span className="text-muted-foreground">план/факт</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', LEVEL_DOT.ok)} />
          <span className="tabular-nums text-foreground">{counts.ok}</span>
          <span className="text-muted-foreground">готово</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', LEVEL_DOT.na)} />
          <span className="tabular-nums text-foreground">{counts.na}</span>
          <span className="text-muted-foreground">не активны</span>
        </span>
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
                        <button
                          type="button"
                          className={cn(
                            'mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums shadow-sm transition-colors',
                            LEVEL_CELL[readiness.level]
                          )}
                          title={`${quarter}: ${readiness.reasons.length ? readiness.reasons.join(' · ') : readiness.level === 'ok' ? 'Готово' : ''}`}
                          aria-label={`${row.initiative || 'Инициатива'}, ${quarter}, статус ${readiness.level}`}
                          onClick={() => setSelection({ rowId: row.id, quarter })}
                        >
                          {readiness.level === 'na' ? '·' : readiness.level === 'ok' ? '✓' : '!'}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/10 px-3 py-2.5 text-[11px] text-muted-foreground">
        <p className="font-medium text-foreground">Легенда</p>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          <li>✓ зелёный — карточка, гео (если есть cost) и метрики по правилам</li>
          <li>! жёлтый — не хватает плана или факта метрики</li>
          <li>! красный — тип/стейкхолдеры/описание или распределение по рынкам</li>
          <li>· серый — нет усилий и стоимости в квартале (можно открыть и задать усилия)</li>
        </ul>
      </div>

      <Sheet open={selection != null} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl"
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
              onOpenFillInitiative={onOpenFillInitiative}
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
  onOpenFillInitiative,
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
  onOpenFillInitiative?: Props['onOpenFillInitiative'];
  onNavigateToCoefficients: () => void;
  onNavigateToTimeline: () => void;
  onNavigateToGeoSplit: () => void;
  onNavigateToTreemap: () => void;
  onClose: () => void;
}) {
  const qd = useMemo(() => mergeQuarterData(row, quarter), [row, quarter]);
  const readiness = useMemo(() => getQuickFlowCellReadiness(row, quarter), [row, quarter]);
  const effortTotal = useMemo(
    () => validateTeamQuarterEffort(teamRows, unit, team, quarter),
    [teamRows, unit, team, quarter]
  );
  const cardMissing = useMemo(() => getMissingInitiativeFields(row), [row]);
  const cost = qd.cost ?? 0;
  const geoIncomplete = cost > 0 && !isGeoCostSplitCompleteForCost(cost, qd.geoCostSplit);
  const planFactRequired = quarterRequiresPlanFact(qd);
  const factRequired = isMetricFactRequiredForQuarter(quarter);

  const stakeholders = row.stakeholdersList ?? [];

  const toggleStakeholder = (label: string, checked: boolean) => {
    if (!onInitiativeDraftChange) return;
    const next = checked
      ? [...new Set([...stakeholders, label])]
      : stakeholders.filter((s) => s !== label);
    onInitiativeDraftChange(row.id, 'stakeholdersList', next);
  };

  return (
    <>
      <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-14 text-left">
        <SheetTitle className="text-base leading-snug pr-2">{row.initiative?.trim() || 'Инициатива'}</SheetTitle>
        <SheetDescription asChild>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{quarter}</span>
            {readiness.reasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4">
                {readiness.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : readiness.level === 'ok' ? (
              <p className="mt-1 text-emerald-600 dark:text-emerald-500">По правилам проверки всё заполнено.</p>
            ) : null}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-6">
        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Быстрый переход к шагам</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => { onClose(); onNavigateToCoefficients(); }}>
              <LayoutGrid className="h-3.5 w-3.5" />
              Коэффициенты
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { onClose(); onNavigateToTreemap(); }}>
              Карточка / описание
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { onClose(); onNavigateToTimeline(); }}>
              Таймлайн
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => { onClose(); onNavigateToGeoSplit(); }}>
              <MapPin className="h-3.5 w-3.5" />
              Гео по странам
            </Button>
          </div>
        </section>

        {onOpenFillInitiative ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-1.5 sm:w-auto"
            onClick={() => {
              onOpenFillInitiative(row.id);
              onClose();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Полная карточка инициативы
          </Button>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Название и коэффициент</h3>
          {onInitiativeDraftChange ? (
            <div className="space-y-1.5">
              <Label htmlFor={`qv-name-${row.id}`}>Название</Label>
              <Input
                id={`qv-name-${row.id}`}
                value={row.initiative ?? ''}
                onChange={(e) => onInitiativeDraftChange(row.id, 'initiative', e.target.value)}
              />
            </div>
          ) : null}
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
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">On-track</p>
              <p className="text-xs text-muted-foreground">Статус в квартале</p>
            </div>
            <Switch
              checked={qd.onTrack !== false}
              onCheckedChange={(v) => onQuarterDataChange(row.id, quarter, 'onTrack', v)}
            />
          </div>
        </section>

        {cardMissing.length > 0 && onInitiativeDraftChange ? (
          <section className="space-y-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
            <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Карточка инициативы</h3>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select
                value={row.initiativeType || ''}
                onValueChange={(v) => onInitiativeDraftChange(row.id, 'initiativeType', v as InitiativeType | '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {INITIATIVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Стейкхолдеры</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border border-border/60 bg-background p-2">
                <div className="flex flex-wrap gap-1.5">
                  {STAKEHOLDERS_LIST.map((st) => {
                    const on = stakeholders.includes(st);
                    return (
                      <label
                        key={st}
                        className={cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted/60'
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(c) => toggleStakeholder(st, c === true)}
                          className="sr-only"
                        />
                        {st}
                      </label>
                    );
                  })}
                </div>
              </div>
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
            <h3 className="text-sm font-semibold text-foreground">План и факт метрики</h3>
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
            <h3 className="text-sm font-semibold text-foreground">Распределение по рынкам</h3>
            <p className="text-xs text-muted-foreground">
              Стоимость квартала:{' '}
              <span className="font-medium tabular-nums text-foreground">{Math.round(cost).toLocaleString('ru-RU')} ₽</span>
            </p>
            {marketCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Справочник стран загружается…</p>
            ) : (
              <GeoCostSplitEditor
                cost={cost}
                value={qd.geoCostSplit}
                countries={marketCountries}
                onChange={(next) => onGeoCostSplitDraftChange(row.id, quarter, next)}
                hideFooterCostLine
              />
            )}
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-6 py-3">
        <Button type="button" className="w-full" variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </>
  );
}
