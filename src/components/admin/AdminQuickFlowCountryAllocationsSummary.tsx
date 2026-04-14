import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { Button } from '@/components/ui/button';
import { AdminQuickFlowMatrixPeriodPicker } from '@/components/admin/AdminQuickFlowMatrixPeriodPicker';

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

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  countries: MarketCountryRow[];
  onBackToSplit: () => void;
};

export function AdminQuickFlowCountryAllocationsSummary({
  rows,
  fillQuarters,
  quartersCatalog,
  countries,
  onBackToSplit,
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

  const [summarySelectedQuarters, setSummarySelectedQuarters] = useState<string[]>([]);
  const [summaryRangeAnchor, setSummaryRangeAnchor] = useState<string | null>(null);
  const [summaryPreviewQuarters, setSummaryPreviewQuarters] = useState<string[] | null>(null);
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
  const [hoverBarCell, setHoverBarCell] = useState<{ row: number; key: string } | null>(null);

  useEffect(() => {
    setSummarySelectedQuarters([...sortedFill]);
    setSummaryRangeAnchor(null);
    setSummaryPreviewQuarters(null);
  }, [sortedFillKey]);

  const handleSummaryReplaceQuarters = useCallback((next: string[]) => {
    setSummarySelectedQuarters([...next].sort(compareQuarters));
    setSummaryRangeAnchor(null);
    setSummaryPreviewQuarters(null);
  }, []);

  const handleSummaryDismissRangeUI = useCallback(() => {
    setSummaryRangeAnchor(null);
    setSummaryPreviewQuarters(null);
  }, []);

  const handleSummaryQuarterClick = useCallback(
    (q: string) => {
      if (summaryRangeAnchor == null) {
        setSummaryRangeAnchor(q);
        setSummaryPreviewQuarters(null);
        return;
      }
      const range = filterQuartersInRange(summaryRangeAnchor, q, summaryCatalogQuarters);
      setSummarySelectedQuarters(range);
      setSummaryRangeAnchor(null);
      setSummaryPreviewQuarters(null);
    },
    [summaryRangeAnchor, summaryCatalogQuarters]
  );

  const handleSummaryQuarterHover = useCallback(
    (q: string | null) => {
      if (summaryRangeAnchor == null || q == null) {
        setSummaryPreviewQuarters(null);
        return;
      }
      setSummaryPreviewQuarters(filterQuartersInRange(summaryRangeAnchor, q, summaryCatalogQuarters));
    },
    [summaryRangeAnchor, summaryCatalogQuarters]
  );

  const summaryVisibleInCatalogOrder = useMemo(() => {
    const sel = new Set(summarySelectedQuarters);
    return summaryCatalogQuarters.filter((q) => sel.has(q));
  }, [summaryCatalogQuarters, summarySelectedQuarters]);

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

  const stackData = useMemo(
    () =>
      initiativeStackData(
        rows,
        quartersForCharts,
        countryIdToClusterKey,
        stackClusterKeys,
        allocationSummary.unallocatedRub > 0
      ),
    [rows, quartersForCharts, countryIdToClusterKey, stackClusterKeys, allocationSummary.unallocatedRub]
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

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">Сводка по аллокациям</h2>
        <Button type="button" variant="outline" size="sm" onClick={onBackToSplit}>
          Назад к распределению
        </Button>
      </div>

      <div
        className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
      >
        <AdminQuickFlowMatrixPeriodPicker
          catalogQuarters={summaryCatalogQuarters}
          visibleQuarters={summaryVisibleInCatalogOrder}
          previewQuarters={summaryPreviewQuarters}
          rangeAnchor={summaryRangeAnchor}
          onQuarterClick={handleSummaryQuarterClick}
          onQuarterHover={handleSummaryQuarterHover}
          onReplaceSelectedQuarters={handleSummaryReplaceQuarters}
          onDismissTransientRangeUI={handleSummaryDismissRangeUI}
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
            <div className="h-[300px] w-full min-w-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40">
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
                    isAnimationActive
                    animationDuration={480}
                    animationEasing="ease-out"
                    activeIndex={activePieIndex}
                    activeShape={pieActiveShape}
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(undefined)}
                  >
                    {pieData.map((entry, i) => {
                      const paletteIdx = pieData
                        .slice(0, i)
                        .filter((e) => e.name !== UNALLOCATED_LABEL).length;
                      const fill =
                        entry.name === UNALLOCATED_LABEL
                          ? UNALLOCATED_FILL
                          : GEO_CHART_PALETTE[paletteIdx % GEO_CHART_PALETTE.length];
                      return (
                        <Cell
                          key={entry.name}
                          fill={fill}
                          fillOpacity={
                            activePieIndex === undefined || activePieIndex === i ? 1 : 0.35
                          }
                          style={{ transition: 'fill-opacity 0.18s ease' }}
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
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (
                      <span
                        className={
                          value === UNALLOCATED_LABEL ? 'text-slate-500 dark:text-slate-400' : 'text-muted-foreground'
                        }
                      >
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <p className="mb-2 text-sm font-medium">По инициативам</p>
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
                      isAnimationActive
                      animationDuration={520}
                      animationEasing="ease-out"
                    >
                      {stackData.map((_, rowIndex) => (
                        <Cell
                          key={`${key}-${rowIndex}`}
                          fill={
                            key === UNALLOCATED_LABEL
                              ? UNALLOCATED_FILL
                              : GEO_CHART_PALETTE[clusterIdx % GEO_CHART_PALETTE.length]
                          }
                          fillOpacity={
                            !hoverBarCell ||
                            (hoverBarCell.row === rowIndex && hoverBarCell.key === key)
                              ? 1
                              : 0.32
                          }
                          style={{ transition: 'fill-opacity 0.15s ease' }}
                          onMouseEnter={() => setHoverBarCell({ row: rowIndex, key })}
                        />
                      ))}
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
