import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminDataRow, GeoCostSplitEntry } from '@/lib/adminDataManager';
import {
  geoCostSplitPercentsTotal,
  marketClusterKeyLabel,
  rubleAmountsFromGeoPercents,
  sortStakeholderLabels,
} from '@/lib/adminDataManager';
import { buildCountryIdToClusterMap, type MarketCountryRow } from '@/hooks/useMarketCountries';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';
import { AdminQuickFlowMatrixPeriodPicker } from '@/components/admin/AdminQuickFlowMatrixPeriodPicker';
import { cn } from '@/lib/utils';

/**
 * Качественная палитра: чуть ярче предыдущей, но без «кислоты».
 * Опора на различимые оттенки (сине-зелёно-оранжево-фиолетовый круг) ~50–58% lightness.
 */
const GEO_CHART_PALETTE = [
  '#5B8FD4',
  '#3DB89A',
  '#E1942F',
  '#9B6FDE',
  '#E85D6C',
  '#2FB8D4',
  '#D06BA8',
  '#6FBF4A',
  '#C9A227',
  '#5A7FD6',
  '#4EC9C0',
  '#E07B3C',
];

/** Срез «не попал ни в один рынок»: нет сплита или сумма % меньше 100. */
const UNALLOCATED_LABEL = 'Не распределено';
const UNALLOCATED_FILL = '#94A3B8';

/** Задержка сброса подсветки при уходе с пункта легенды — быстрый переход между соседними кластерами без «мигания». */
const LEGEND_HOVER_CLEAR_MS = 100;

function uniqueSortedQuarters(qs: string[]): string[] {
  return [...new Set(qs.filter(Boolean))].sort(compareQuarters);
}

function truncateLabel(s: string, max = 80): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function addQuarterGeoToMaps(
  cost: number,
  entries: GeoCostSplitEntry[] | undefined,
  countryIdToClusterKey: Map<string, string>,
  byCluster: Map<string, number>,
  unallocatedAcc: { rub: number }
): void {
  const c = Math.round(Number(cost) || 0);
  if (c <= 0) return;
  if (!entries?.length) {
    unallocatedAcc.rub += c;
    return;
  }
  const t = geoCostSplitPercentsTotal(entries);
  const capT = Math.min(100, t);
  unallocatedAcc.rub += Math.round((c * (100 - capT)) / 100);
  if (capT <= 0) return;
  const effectiveCost = Math.round((c * capT) / 100);
  const scale = capT / t;
  const scaledPercents = entries.map((e) => e.percent * scale);
  const rubles = rubleAmountsFromGeoPercents(effectiveCost, scaledPercents);
  entries.forEach((e, i) => {
    const ck = e.kind === 'cluster' ? e.clusterKey : countryIdToClusterKey.get(e.countryId) ?? '—';
    const label = marketClusterKeyLabel(ck);
    byCluster.set(label, (byCluster.get(label) ?? 0) + (rubles[i] ?? 0));
  });
}

function collectAllocationRubles(
  rows: AdminDataRow[],
  quarterKeys: string[],
  countryIdToClusterKey: Map<string, string>
): { byCluster: Map<string, number>; unallocatedRub: number } {
  const m = new Map<string, number>();
  const unallocatedAcc = { rub: 0 };
  for (const row of rows) {
    for (const q of quarterKeys) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      addQuarterGeoToMaps(cost, qd?.geoCostSplit?.entries, countryIdToClusterKey, m, unallocatedAcc);
    }
  }
  return { byCluster: m, unallocatedRub: unallocatedAcc.rub };
}

type StackDatum = Record<string, number | string> & { name: string; totalRub: number };
type InitiativeRublesRow = {
  name: string;
  totalRub: number;
  byCluster: Map<string, number>;
};

/**
 * Целые проценты по кластерам, сумма строго 100 (без float-дрейфа на оси и в стеке).
 * Largest remainder method по рублям.
 */
function integerPercentsByCluster(
  segmentKeys: string[],
  byC: Map<string, number>,
  totalRub: number
): Record<string, number> {
  const weights = segmentKeys.map((c) => byC.get(c) ?? 0);
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0 || totalRub <= 0) return Object.fromEntries(segmentKeys.map((c) => [c, 0]));
  const exact = weights.map((w) => (100 * w) / s);
  const floor = exact.map((x) => Math.floor(x));
  let rem = 100 - floor.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - floor[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floor];
  for (let k = 0; k < rem; k++) {
    out[order[k % order.length].i] += 1;
  }
  const rec: Record<string, number> = {};
  segmentKeys.forEach((c, i) => {
    rec[c] = out[i] ?? 0;
  });
  return rec;
}

function initiativeStackData(
  rows: AdminDataRow[],
  quarterKeys: string[],
  countryIdToClusterKey: Map<string, string>,
  segmentKeys: string[],
  includeUnallocatedInStack: boolean
): StackDatum[] {
  const out: StackDatum[] = [];
  for (const row of rows) {
    const byC = new Map<string, number>();
    const unallocatedAcc = { rub: 0 };
    let totalCostRub = 0;
    for (const q of quarterKeys) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      const c = Math.round(Number(cost) || 0);
      if (c <= 0) continue;
      totalCostRub += c;
      addQuarterGeoToMaps(cost, qd?.geoCostSplit?.entries, countryIdToClusterKey, byC, unallocatedAcc);
    }
    if (totalCostRub <= 0) continue;
    const rec: StackDatum = {
      name: truncateLabel(row.initiative || 'Без названия'),
      totalRub: totalCostRub,
    };
    const weightMap = new Map<string, number>(byC);
    if (includeUnallocatedInStack) {
      weightMap.set(UNALLOCATED_LABEL, unallocatedAcc.rub);
    }
    const intPct = integerPercentsByCluster(segmentKeys, weightMap, totalCostRub);
    for (const k of segmentKeys) {
      rec[k] = intPct[k] ?? 0;
    }
    out.push(rec);
  }
  return out;
}

function collectInitiativeRublesRows(
  rows: AdminDataRow[],
  quarterKeys: string[],
  countryIdToClusterKey: Map<string, string>,
  includeUnallocated: boolean
): InitiativeRublesRow[] {
  const out: InitiativeRublesRow[] = [];
  for (const row of rows) {
    const byCluster = new Map<string, number>();
    const unallocatedAcc = { rub: 0 };
    let totalRub = 0;
    for (const q of quarterKeys) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      const c = Math.round(Number(cost) || 0);
      if (c <= 0) continue;
      totalRub += c;
      addQuarterGeoToMaps(cost, qd?.geoCostSplit?.entries, countryIdToClusterKey, byCluster, unallocatedAcc);
    }
    if (totalRub <= 0) continue;
    if (includeUnallocated && unallocatedAcc.rub > 0) {
      byCluster.set(UNALLOCATED_LABEL, unallocatedAcc.rub);
    }
    out.push({
      name: truncateLabel(row.initiative || 'Без названия'),
      totalRub,
      byCluster,
    });
  }
  return out;
}

type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name: string; value: number } }>;
  totalRub: number;
};

function PieAllocationTooltip({ active, payload, totalRub }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const name = item.name ?? item.payload?.name;
  const value = typeof item.value === 'number' ? item.value : item.payload?.value ?? 0;
  if (name == null) return null;
  const pct = totalRub > 0 ? (value / totalRub) * 100 : 0;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium leading-snug">{name}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {Math.round(value).toLocaleString('ru-RU')} ₽ ({pct.toFixed(1)}%)
      </p>
    </div>
  );
}

type BarTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number; payload?: StackDatum }>;
};

/** При `shared={false}` в подсказке только сегмент под курсором. */
function BarStackTooltip({ active, label, payload }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const row = p.payload;
  const totalRub = row?.totalRub ?? 0;
  const pct = Number(p.value);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const segName = String(p.name ?? '');
  const initiativeTitle =
    typeof label === 'string' && label.trim().length > 0 ? label : (row?.name ?? '—');
  const rub = totalRub > 0 ? (pct / 100) * totalRub : 0;
  return (
    <div className="max-w-[min(100vw-2rem,18rem)] rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium leading-snug">{initiativeTitle}</p>
      <p className="mt-1 text-muted-foreground">{segName}</p>
      <p className="mt-1 tabular-nums">
        {pct.toFixed(1)}% · {Math.round(rub).toLocaleString('ru-RU')} ₽
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts Sector props
function pieActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      style={{
        filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.12))',
        transition: 'filter 0.15s ease',
      }}
    />
  );
}

type PieSliceDatum = { name: string; value: number };

type LegendPayloadEntry = { value?: unknown; color?: string };

function ClusterAllocationsLegend({
  payload,
  pieSlices,
  pieTotalRub,
  highlightedKey,
  onHighlightKey,
  onScheduleClearHighlight,
}: {
  payload?: LegendPayloadEntry[];
  pieSlices: PieSliceDatum[];
  pieTotalRub: number;
  highlightedKey: string | null;
  onHighlightKey: (name: string) => void;
  onScheduleClearHighlight: () => void;
}) {
  if (!payload?.length) return null;
  const rubByName = new Map<string, number>();
  for (const s of pieSlices) rubByName.set(s.name, s.value);

  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 px-1 pt-2">
      {payload.map((item) => {
        const name = String(item.value ?? '');
        const rub = rubByName.get(name) ?? 0;
        const pct = pieTotalRub > 0 ? Math.round((rub / pieTotalRub) * 100) : 0;
        const active = highlightedKey === name;
        const isUnalloc = name === UNALLOCATED_LABEL;
        return (
          <button
            key={name}
            type="button"
            aria-label={`${name}${pieTotalRub > 0 ? `, ${pct}%` : ''}`}
            className={cn(
              'inline-flex max-w-[min(100%,14rem)] cursor-default items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 text-[11px] leading-snug outline-none transition-all duration-150',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'scale-[1.07] bg-muted shadow-md ring-1 ring-primary/30'
                : 'hover:bg-muted/60'
            )}
            onMouseEnter={() => onHighlightKey(name)}
            onMouseLeave={onScheduleClearHighlight}
            onFocus={() => onHighlightKey(name)}
            onBlur={onScheduleClearHighlight}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span
              className={cn(
                'min-w-0 flex-1 break-words text-left',
                isUnalloc ? 'text-slate-500 dark:text-slate-400' : 'text-muted-foreground'
              )}
            >
              {name}
            </span>
            {active ? (
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{pct}%</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  countries: MarketCountryRow[];
  visibleQuarters: string[];
  previewQuarters: string[] | null;
  rangeAnchor: string | null;
  onQuarterClick: (q: string) => void;
  onQuarterHover: (q: string | null) => void;
  onReplaceSelectedQuarters: (quarters: string[]) => void;
  onDismissTransientRangeUI: () => void;
};

export function AdminQuickFlowCountryAllocationsSummary({
  rows,
  fillQuarters,
  quartersCatalog,
  countries,
  visibleQuarters,
  previewQuarters,
  rangeAnchor,
  onQuarterClick,
  onQuarterHover,
  onReplaceSelectedQuarters,
  onDismissTransientRangeUI,
}: Props) {
  const sortedFill = useMemo(
    () => [...fillQuarters].filter(Boolean).sort(compareQuarters),
    [fillQuarters]
  );
  const sortedFillKey = sortedFill.join('|');

  const summaryCatalogQuarters = useMemo(() => {
    const cat = uniqueSortedQuarters(quartersCatalog);
    if (cat.length === 0) return sortedFill;
    return uniqueSortedQuarters([...cat, ...sortedFill]);
  }, [quartersCatalog, sortedFill]);

  const countryIdToClusterKey = useMemo(() => buildCountryIdToClusterMap(countries), [countries]);

  /** Подсветка сегментов только от ховера/фокуса легенды. */
  const [highlightedClusterKey, setHighlightedClusterKey] = useState<string | null>(null);
  const [hoverBarCell, setHoverBarCell] = useState<{ row: number; key: string } | null>(null);
  const legendClearTimerRef = useRef<number | null>(null);

  const cancelLegendClearTimer = useCallback(() => {
    if (legendClearTimerRef.current != null) {
      window.clearTimeout(legendClearTimerRef.current);
      legendClearTimerRef.current = null;
    }
  }, []);

  const scheduleLegendHighlightClear = useCallback(() => {
    cancelLegendClearTimer();
    legendClearTimerRef.current = window.setTimeout(() => {
      legendClearTimerRef.current = null;
      setHighlightedClusterKey(null);
    }, LEGEND_HOVER_CLEAR_MS);
  }, [cancelLegendClearTimer]);

  const setLegendHighlight = useCallback(
    (name: string) => {
      cancelLegendClearTimer();
      setHighlightedClusterKey(name);
    },
    [cancelLegendClearTimer]
  );

  useEffect(() => () => cancelLegendClearTimer(), [cancelLegendClearTimer]);

  const summaryVisibleInCatalogOrder = useMemo(() => {
    const sel = new Set(visibleQuarters);
    return summaryCatalogQuarters.filter((q) => sel.has(q));
  }, [summaryCatalogQuarters, visibleQuarters]);

  const quartersForCharts = useMemo(() => {
    return summaryVisibleInCatalogOrder.length > 0 ? summaryVisibleInCatalogOrder : sortedFill;
  }, [summaryVisibleInCatalogOrder, sortedFill]);

  const allocationSummary = useMemo(() => {
    const { byCluster, unallocatedRub } = collectAllocationRubles(
      rows,
      quartersForCharts,
      countryIdToClusterKey
    );
    const clusterLabels = sortStakeholderLabels([...byCluster.keys()]);
    const pieSlices = clusterLabels
      .map((name) => ({ name, value: byCluster.get(name) ?? 0 }))
      .filter((d) => d.value > 0);
    if (unallocatedRub > 0) {
      pieSlices.push({ name: UNALLOCATED_LABEL, value: unallocatedRub });
    }
    const pieTotalRub = pieSlices.reduce((s, d) => s + d.value, 0);
    const stackKeys = unallocatedRub > 0 ? [...clusterLabels, UNALLOCATED_LABEL] : clusterLabels;
    return { unallocatedRub, pieSlices, pieTotalRub, stackKeys };
  }, [rows, quartersForCharts, countryIdToClusterKey]);

  const pieData = allocationSummary.pieSlices;
  const pieTotalRub = allocationSummary.pieTotalRub;
  const stackClusterKeys = allocationSummary.stackKeys;

  const pieActiveHighlightIndex = useMemo(() => {
    if (!highlightedClusterKey) return undefined;
    const i = pieData.findIndex((d) => d.name === highlightedClusterKey);
    return i >= 0 ? i : undefined;
  }, [highlightedClusterKey, pieData]);

  const highlightedPieStat = useMemo(() => {
    if (!highlightedClusterKey) return null;
    const rub = pieData.find((d) => d.name === highlightedClusterKey)?.value ?? 0;
    if (rub <= 0) return null;
    const pct = pieTotalRub > 0 ? (rub / pieTotalRub) * 100 : 0;
    return { name: highlightedClusterKey, rub, pct };
  }, [highlightedClusterKey, pieData, pieTotalRub]);

  const includeUnallocatedInStack = allocationSummary.unallocatedRub > 0;
  const initiativeRublesRows = useMemo(
    () =>
      collectInitiativeRublesRows(
        rows,
        quartersForCharts,
        countryIdToClusterKey,
        includeUnallocatedInStack
      ),
    [rows, quartersForCharts, countryIdToClusterKey, includeUnallocatedInStack]
  );

  const stackData = useMemo(
    () =>
      initiativeRublesRows.map((row) => {
        const rec: StackDatum = { name: row.name, totalRub: row.totalRub };
        const intPct = integerPercentsByCluster(stackClusterKeys, row.byCluster, row.totalRub);
        for (const k of stackClusterKeys) rec[k] = intPct[k] ?? 0;
        return rec;
      }),
    [initiativeRublesRows, stackClusterKeys]
  );

  const barChartHeight = useMemo(() => {
    const perRow = 44;
    const axisPad = 44;
    const raw = stackData.length * perRow + axisPad;
    return Math.min(1600, Math.max(100, raw));
  }, [stackData.length]);

  const yAxisWidth = useMemo(() => {
    const maxLen = stackData.reduce((m, d) => Math.max(m, d.name.length), 0);
    return Math.min(300, Math.max(120, Math.round(maxLen * 7 + 20)));
  }, [stackData]);

  type InitiativeClusterRow = { initiative: string; pct: number; rub: number };

  const initiativeRowsByCluster = useMemo(() => {
    const map = new Map<string, InitiativeClusterRow[]>();
    for (const clusterKey of stackClusterKeys) {
      const rows = initiativeRublesRows
        .map((row) => {
          const rub = row.byCluster.get(clusterKey) ?? 0;
          const pct = row.totalRub > 0 ? (rub / row.totalRub) * 100 : 0;
          return { initiative: row.name, pct, rub };
        })
        .filter((x) => x.pct > 0 && x.rub > 0)
        .sort((a, b) => b.rub - a.rub);
      map.set(clusterKey, rows);
    }
    return map;
  }, [initiativeRublesRows, stackClusterKeys]);

  const highlightedInitiativeRows = useMemo(() => {
    if (!highlightedClusterKey) return [];
    return initiativeRowsByCluster.get(highlightedClusterKey) ?? [];
  }, [highlightedClusterKey, initiativeRowsByCluster]);

  const chartsAnimating = false;
  const cellOpacityTransition = highlightedClusterKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.18s ease';
  const barCellOpacityTransition = highlightedClusterKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.15s ease';

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <h2 className="text-lg font-semibold">Сводка по аллокациям</h2>

      <div
        className="sticky top-0 z-20 overflow-visible rounded-xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
      >
        <AdminQuickFlowMatrixPeriodPicker
          catalogQuarters={summaryCatalogQuarters}
          visibleQuarters={summaryVisibleInCatalogOrder}
          previewQuarters={previewQuarters}
          rangeAnchor={rangeAnchor}
          onQuarterClick={onQuarterClick}
          onQuarterHover={onQuarterHover}
          onReplaceSelectedQuarters={onReplaceSelectedQuarters}
          onDismissTransientRangeUI={onDismissTransientRangeUI}
          hideAddInitiativeButton
          hidePeriodPicker={false}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">По кластерам</p>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет сумм — добавьте строки и проценты по инициативам.</p>
          ) : (
            <div className="relative h-[300px] w-full min-w-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40">
              {highlightedPieStat ? (
                <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-border bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-md backdrop-blur-sm">
                  <p className="font-medium leading-snug">{highlightedPieStat.name}</p>
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    {Math.round(highlightedPieStat.rub).toLocaleString('ru-RU')} ₽ ({highlightedPieStat.pct.toFixed(1)}%)
                  </p>
                </div>
              ) : null}
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    innerRadius="42%"
                    outerRadius="68%"
                    paddingAngle={1.5}
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    label={false}
                    isAnimationActive={chartsAnimating}
                    animationDuration={480}
                    animationEasing="ease-out"
                    activeIndex={pieActiveHighlightIndex}
                    activeShape={pieActiveShape}
                  >
                    {pieData.map((entry, i) => {
                      const paletteIdx = pieData
                        .slice(0, i)
                        .filter((e) => e.name !== UNALLOCATED_LABEL).length;
                      const fill =
                        entry.name === UNALLOCATED_LABEL
                          ? UNALLOCATED_FILL
                          : GEO_CHART_PALETTE[paletteIdx % GEO_CHART_PALETTE.length];
                      const dim =
                        highlightedClusterKey != null && entry.name !== highlightedClusterKey;
                      return (
                        <Cell
                          key={entry.name}
                          fill={fill}
                          fillOpacity={dim ? 0.35 : 1}
                          style={{ transition: cellOpacityTransition }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={(props) => <PieAllocationTooltip {...props} totalRub={pieTotalRub} />}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    wrapperStyle={{ paddingTop: 4 }}
                    content={(legendProps) => (
                      <ClusterAllocationsLegend
                        payload={legendProps.payload as LegendPayloadEntry[] | undefined}
                        pieSlices={pieData}
                        pieTotalRub={pieTotalRub}
                        highlightedKey={highlightedClusterKey}
                        onHighlightKey={setLegendHighlight}
                        onScheduleClearHighlight={scheduleLegendHighlightClear}
                      />
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <p className="mb-2 text-sm font-medium">По инициативам</p>
          {highlightedClusterKey ? (
            <div className="mb-2 rounded-md border border-border bg-popover/70 px-2.5 py-2 text-xs text-popover-foreground">
              <p className="font-medium leading-snug">{highlightedClusterKey}</p>
              {highlightedInitiativeRows.length === 0 ? (
                <p className="mt-1 text-muted-foreground">Нет сумм по выбранному кластеру.</p>
              ) : (
                <div className="mt-1.5 max-h-24 space-y-1 overflow-auto pr-1">
                  {highlightedInitiativeRows.map((row) => (
                    <p key={row.initiative} className="flex items-center justify-between gap-2 tabular-nums">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.initiative}</span>
                      <span>{row.rub.toLocaleString('ru-RU')} ₽ · {row.pct.toFixed(1)}%</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {stackData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных для столбцов.</p>
          ) : (
            <div
              className="w-full min-w-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40"
              style={{ height: barChartHeight }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stackData}
                  margin={{ top: 4, right: 10, left: 2, bottom: 4 }}
                  barCategoryGap={2}
                  barGap={0}
                  maxBarSize={44}
                  onMouseLeave={() => setHoverBarCell(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    allowDecimals={false}
                    tickFormatter={(v) => `${Math.round(Number(v))}%`}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={yAxisWidth}
                    tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                    interval={0}
                  />
                  <Tooltip
                    content={<BarStackTooltip />}
                    cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                    shared={false}
                  />
                  {stackClusterKeys.map((key, clusterIdx) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="split"
                      fill={
                        key === UNALLOCATED_LABEL
                          ? UNALLOCATED_FILL
                          : GEO_CHART_PALETTE[clusterIdx % GEO_CHART_PALETTE.length]
                      }
                      isAnimationActive={chartsAnimating}
                      animationDuration={520}
                      animationEasing="ease-out"
                    >
                      <LabelList
                        dataKey={key}
                        position="center"
                        content={(labelProps: Record<string, unknown>) => {
                          if (highlightedClusterKey !== key) return null;
                          const x = Number(labelProps.x);
                          const y = Number(labelProps.y);
                          const w = Number(labelProps.width);
                          const h = Number(labelProps.height);
                          const value = Number(labelProps.value);
                          if (!Number.isFinite(value) || value < 5) return null;
                          if (!Number.isFinite(w) || w < 12) return null;
                          return (
                            <text
                              x={x + w / 2}
                              y={y + h / 2}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#fff"
                              fontSize={10}
                              fontWeight={700}
                              className="tabular-nums"
                              style={{
                                paintOrder: 'stroke',
                                stroke: 'rgba(0,0,0,0.45)',
                                strokeWidth: 2,
                                strokeLinejoin: 'round',
                              }}
                            >
                              {`${Math.round(value)}%`}
                            </text>
                          );
                        }}
                      />
                      {stackData.map((_, rowIndex) => {
                        const dimFromLegend =
                          highlightedClusterKey != null && key !== highlightedClusterKey;
                        const dimFromBar =
                          !highlightedClusterKey &&
                          hoverBarCell != null &&
                          (hoverBarCell.row !== rowIndex || hoverBarCell.key !== key);
                        const dim = highlightedClusterKey != null ? dimFromLegend : dimFromBar;
                        return (
                          <Cell
                            key={`${key}-${rowIndex}`}
                            fill={
                              key === UNALLOCATED_LABEL
                                ? UNALLOCATED_FILL
                                : GEO_CHART_PALETTE[clusterIdx % GEO_CHART_PALETTE.length]
                            }
                            fillOpacity={dim ? 0.32 : 1}
                            style={{ transition: barCellOpacityTransition }}
                            onMouseEnter={() => setHoverBarCell({ row: rowIndex, key })}
                          />
                        );
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
