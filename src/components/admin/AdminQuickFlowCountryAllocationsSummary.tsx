import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { MonthlyMorphStackedChart } from '@/components/admin/MonthlyMorphStackedChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const MONTH_LABELS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];


function quarterToMonthInfos(quarter: string): Array<{ key: string; label: string }> {
  const match = quarter.match(/^(\d{4})-Q(\d)$/);
  if (!match) return [];
  const year = parseInt(match[1], 10);
  const qn = parseInt(match[2], 10);
  if (qn < 1 || qn > 4) return [];
  const startMonth = (qn - 1) * 3 + 1;
  return [0, 1, 2].map((i) => {
    const m = startMonth + i;
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const label = `${MONTH_LABELS_RU[m - 1]} ${year}`;
    return { key, label };
  });
}

function orderedMonthsFromQuarters(quarters: string[]): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  for (const q of quarters) {
    for (const mi of quarterToMonthInfos(q)) {
      if (!seen.has(mi.key)) {
        seen.add(mi.key);
        out.push(mi);
      }
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

type MonthStackRow = Record<string, number | string> & {
  monthKey: string;
  monthLabel: string;
  totalRub: number;
};

function buildMonthlyRowsByCluster(
  rows: AdminDataRow[],
  quarters: string[],
  countryIdToClusterKey: Map<string, string>,
  stackKeys: string[],
  /** Если задан и непустой — в столбцах и в totalRub только эти кластеры (остальные не показываем). */
  visibleClusterKeys?: string[]
): MonthStackRow[] {
  const keysOut =
    visibleClusterKeys && visibleClusterKeys.length > 0 ? visibleClusterKeys : stackKeys;
  const monthOrder = orderedMonthsFromQuarters(quarters);
  const acc = new Map<string, Map<string, number>>();
  for (const { key } of monthOrder) acc.set(key, new Map());

  for (const q of quarters) {
    const mins = quarterToMonthInfos(q);
    if (mins.length === 0) continue;
    for (const row of rows) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      const c = Math.round(Number(cost) || 0);
      if (c <= 0) continue;
      const byCluster = new Map<string, number>();
      const unallocatedAcc = { rub: 0 };
      addQuarterGeoToMaps(cost, qd?.geoCostSplit?.entries, countryIdToClusterKey, byCluster, unallocatedAcc);

      const pushThird = (label: string, rub: number) => {
        if (rub <= 0) return;
        const third = Math.round(rub / 3);
        if (third <= 0) return;
        for (const mi of mins) {
          const m = acc.get(mi.key);
          if (m) m.set(label, (m.get(label) ?? 0) + third);
        }
      };
      for (const [label, rub] of byCluster) pushThird(label, rub);
      if (unallocatedAcc.rub > 0) pushThird(UNALLOCATED_LABEL, unallocatedAcc.rub);
    }
  }

  return monthOrder.map(({ key, label }) => {
    const m = acc.get(key) ?? new Map();
    let totalRub = 0;
    const rec: MonthStackRow = { monthKey: key, monthLabel: label, totalRub: 0 };
    for (const k of keysOut) {
      const v = m.get(k) ?? 0;
      rec[k] = v;
      totalRub += v;
    }
    rec.totalRub = totalRub;
    return rec;
  });
}

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
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    />
  );
}

const ALLOCATIONS_RECHARTS_SHELL =
  'select-none [-webkit-user-select:none] [&_.recharts-responsive-container]:outline-none [&_.recharts-responsive-container]:focus:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_svg_*]:outline-none [&_svg_*]:[-webkit-tap-highlight-color:transparent] [&_*:focus]:outline-none [&_*:focus-visible]:outline-none';

function blurActiveElementIfInsideSvg() {
  requestAnimationFrame(() => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae.closest('svg')) ae.blur();
  });
}

function handleAllocationsChartPointerCapture(e: ReactPointerEvent<HTMLDivElement>) {
  const t = e.target;
  if (!(t instanceof Element) || !t.closest('svg')) return;
  blurActiveElementIfInsideSvg();
}

function handleAllocationsChartPointerDownCapture(e: ReactPointerEvent<HTMLDivElement>) {
  const t = e.target;
  if (!(t instanceof Element) || !t.closest('svg')) return;
  window.setTimeout(() => blurActiveElementIfInsideSvg(), 0);
}

type PieSliceDatum = { name: string; value: number };

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

  const summaryCatalogQuarters = useMemo(() => {
    const cat = uniqueSortedQuarters(quartersCatalog);
    if (cat.length === 0) return sortedFill;
    return uniqueSortedQuarters([...cat, ...sortedFill]);
  }, [quartersCatalog, sortedFill]);

  const countryIdToClusterKey = useMemo(() => buildCountryIdToClusterMap(countries), [countries]);

  /** Подсветка сегментов от ховера/фокуса легенды. */
  const [highlightedClusterKey, setHighlightedClusterKey] = useState<string | null>(null);
  /** Закрепление кластера: общее для вкладок «За период» и «По месяцам» (легенда, пирог, помесячные чипы). */
  const [lockedClusterKey, setLockedClusterKey] = useState<string | null>(null);
  const [allocationsSummaryTab, setAllocationsSummaryTab] = useState<'period' | 'monthly'>('period');
  const [monthlyLegendHoverKey, setMonthlyLegendHoverKey] = useState<string | null>(null);
  const [hoverBarCell, setHoverBarCell] = useState<{ row: number; key: string } | null>(null);
  const legendClearTimerRef = useRef<number | null>(null);

  const toggleClusterLock = useCallback((name: string) => {
    setLockedClusterKey((prev) => (prev === name ? null : name));
  }, []);

  const pieFocusKey = lockedClusterKey ?? highlightedClusterKey;

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

  const fillForPieSlice = useCallback(
    (entry: PieSliceDatum, indexInPieData: number) => {
      if (entry.name === UNALLOCATED_LABEL) return UNALLOCATED_FILL;
      const paletteIdx = pieData
        .slice(0, indexInPieData)
        .filter((e) => e.name !== UNALLOCATED_LABEL).length;
      return GEO_CHART_PALETTE[paletteIdx % GEO_CHART_PALETTE.length];
    },
    [pieData]
  );

  const pieActiveHighlightIndex = useMemo(() => {
    if (!pieFocusKey) return undefined;
    const i = pieData.findIndex((d) => d.name === pieFocusKey);
    return i >= 0 ? i : undefined;
  }, [pieFocusKey, pieData]);

  const highlightedPieStat = useMemo(() => {
    if (!pieFocusKey) return null;
    const rub = pieData.find((d) => d.name === pieFocusKey)?.value ?? 0;
    if (rub <= 0) return null;
    const pct = pieTotalRub > 0 ? (rub / pieTotalRub) * 100 : 0;
    return { name: pieFocusKey, rub, pct };
  }, [pieFocusKey, pieData, pieTotalRub]);

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

  const panelClusterKey = lockedClusterKey ?? highlightedClusterKey;

  const highlightedInitiativeRows = useMemo(() => {
    if (!panelClusterKey) return [];
    return initiativeRowsByCluster.get(panelClusterKey) ?? [];
  }, [panelClusterKey, initiativeRowsByCluster]);

  useEffect(() => {
    if (lockedClusterKey && !stackClusterKeys.includes(lockedClusterKey)) {
      setLockedClusterKey(null);
    }
  }, [stackClusterKeys, lockedClusterKey]);

  const monthlyAllClusterRows = useMemo(
    () =>
      buildMonthlyRowsByCluster(rows, quartersForCharts, countryIdToClusterKey, stackClusterKeys),
    [rows, quartersForCharts, countryIdToClusterKey, stackClusterKeys]
  );

  const { monthlyChartRows, monthlyBarKeys } = useMemo(() => {
    const pin =
      lockedClusterKey && stackClusterKeys.includes(lockedClusterKey) ? lockedClusterKey : null;
    if (!pin) {
      return { monthlyChartRows: monthlyAllClusterRows, monthlyBarKeys: stackClusterKeys };
    }
    const keys = sortStakeholderLabels([pin]);
    return {
      monthlyChartRows: buildMonthlyRowsByCluster(
        rows,
        quartersForCharts,
        countryIdToClusterKey,
        stackClusterKeys,
        keys
      ),
      monthlyBarKeys: keys,
    };
  }, [
    lockedClusterKey,
    stackClusterKeys,
    monthlyAllClusterRows,
    rows,
    quartersForCharts,
    countryIdToClusterKey,
  ]);

  /** Ширина области графика: при длинном ряду месяцев — горизонтальный скролл, высота не от суммы месяцев. */
  const monthlyScrollMinWidth = useMemo(() => {
    const n = monthlyChartRows.length;
    if (n === 0) return 0;
    return Math.min(2600, Math.max(360, n * 28 + 100));
  }, [monthlyChartRows.length]);

  const fillForMonthlyBarKey = useCallback(
    (key: string, idx: number) => {
      if (key === UNALLOCATED_LABEL) return UNALLOCATED_FILL;
      const i = stackClusterKeys.indexOf(key);
      return GEO_CHART_PALETTE[(i >= 0 ? i : idx) % GEO_CHART_PALETTE.length];
    },
    [stackClusterKeys]
  );

  const chartsAnimating = false;
  const cellOpacityTransition = pieFocusKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.18s ease';
  const barCellOpacityTransition = pieFocusKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.15s ease';

  const effectiveMonthlyLegendHoverKey = useMemo(() => {
    if (!monthlyLegendHoverKey) return null;
    return monthlyBarKeys.includes(monthlyLegendHoverKey) ? monthlyLegendHoverKey : null;
  }, [monthlyLegendHoverKey, monthlyBarKeys]);

  const monthlyXAxisInterval = useMemo(() => {
    const n = monthlyChartRows.length;
    if (n > 20) return 2;
    if (n > 12) return 1;
    return 0;
  }, [monthlyChartRows.length]);

  useEffect(() => {
    if (monthlyLegendHoverKey && !stackClusterKeys.includes(monthlyLegendHoverKey)) {
      setMonthlyLegendHoverKey(null);
    }
  }, [monthlyLegendHoverKey, stackClusterKeys]);

  const monthlyLegendTotalsByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of stackClusterKeys) m.set(k, 0);
    for (const row of monthlyAllClusterRows) {
      for (const k of stackClusterKeys) {
        const v = Number(row[k] ?? 0);
        if (!Number.isFinite(v) || v <= 0) continue;
        m.set(k, (m.get(k) ?? 0) + v);
      }
    }
    return m;
  }, [monthlyAllClusterRows, stackClusterKeys]);

  const monthlyLegendTotalRub = useMemo(() => {
    return [...monthlyLegendTotalsByKey.values()].reduce((s, v) => s + v, 0);
  }, [monthlyLegendTotalsByKey]);

  const monthlyHoveredLegendStat = useMemo(() => {
    if (!effectiveMonthlyLegendHoverKey) return null;
    const rub = monthlyLegendTotalsByKey.get(effectiveMonthlyLegendHoverKey) ?? 0;
    if (rub <= 0) return null;
    const pct = monthlyLegendTotalRub > 0 ? (rub / monthlyLegendTotalRub) * 100 : 0;
    return { key: effectiveMonthlyLegendHoverKey, rub, pct };
  }, [effectiveMonthlyLegendHoverKey, monthlyLegendTotalsByKey, monthlyLegendTotalRub]);

  return (
    <section className="alloc-summary-charts flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto">
      <h2 className="text-lg font-semibold">Сводка по аллокациям</h2>

      <Tabs
        value={allocationsSummaryTab}
        onValueChange={(v) => setAllocationsSummaryTab(v as 'period' | 'monthly')}
        className="min-h-0 min-w-0"
      >
        <div className="rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="space-y-1 border-b border-border/60 bg-muted/20 px-2 py-2 sm:px-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <div className="flex min-w-0 shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
                  Итого за период
                </span>
                <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground sm:text-xl">
                  {Math.round(pieTotalRub).toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="min-w-0 max-w-md flex-1 basis-[11rem] sm:basis-48">
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
                  compactPeriodPicker
                  embedded
                />
              </div>
              <div className="ml-auto shrink-0">
                <TabsList className="inline-flex h-auto flex-wrap justify-end gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 shadow-sm sm:p-1">
                  <TabsTrigger
                    value="period"
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm sm:px-3 sm:py-2 sm:text-sm"
                  >
                    За период
                  </TabsTrigger>
                  <TabsTrigger
                    value="monthly"
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm sm:px-3 sm:py-2 sm:text-sm"
                  >
                    По месяцам
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {stackClusterKeys.length > 0 ? (
              <div className="mt-1.5 border-t border-border/45 pt-1.5">
                <div
                  className={cn(
                    'flex max-w-full min-w-0 flex-nowrap items-stretch gap-1.5 rounded-lg px-1 py-1 sm:gap-2 sm:px-1.5',
                    lockedClusterKey
                      ? 'bg-muted/25 ring-1 ring-border/50'
                      : 'bg-muted/10 ring-1 ring-border/35'
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                  {allocationsSummaryTab === 'period' && pieData.length > 0
                    ? pieData.map((entry, idx) => {
                      const name = entry.name;
                      const locked = lockedClusterKey === name;
                      const emphasized = pieFocusKey === name;
                      const dimmed = pieFocusKey != null && name !== pieFocusKey;
                      const pct = pieTotalRub > 0 ? Math.round((entry.value / pieTotalRub) * 100) : 0;
                      return (
                        <button
                          key={name}
                          type="button"
                          tabIndex={-1}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background/90 px-2 py-0.5 text-[10px] leading-tight text-foreground shadow-sm transition-colors outline-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus-visible:ring-0',
                            locked
                              ? 'border-primary bg-primary/10'
                              : emphasized
                                ? 'border-primary/55 bg-muted/90'
                                : 'border-border/70 hover:bg-muted/80',
                            dimmed ? 'opacity-55' : 'opacity-100'
                          )}
                          title={name}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setLegendHighlight(name)}
                          onMouseLeave={scheduleLegendHighlightClear}
                          onClick={() => toggleClusterLock(name)}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-sm ring-1 ring-black/10"
                            style={{ backgroundColor: fillForPieSlice(entry, idx) }}
                            aria-hidden
                          />
                          <span className="max-w-[8rem] truncate">{name}</span>
                          {emphasized ? (
                            <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
                          ) : null}
                        </button>
                      );
                    })
                    : null}
                  {allocationsSummaryTab === 'monthly'
                    ? stackClusterKeys.map((key, idx) => {
                        const selectedSingle = lockedClusterKey === key;
                        const dimmed =
                          lockedClusterKey != null && lockedClusterKey !== key;
                        return (
                          <button
                            key={key}
                            type="button"
                            tabIndex={-1}
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background/90 px-2 py-0.5 text-[10px] leading-tight text-foreground shadow-sm transition-colors outline-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus-visible:ring-0',
                              selectedSingle
                                ? 'border-primary bg-primary/10'
                                : 'border-border/70 hover:bg-muted/80',
                              dimmed ? 'opacity-55' : 'opacity-100'
                            )}
                            title={key}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setMonthlyLegendHoverKey(key)}
                            onMouseLeave={() => setMonthlyLegendHoverKey(null)}
                            onClick={() => toggleClusterLock(key)}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-sm ring-1 ring-black/10"
                              style={{ backgroundColor: fillForMonthlyBarKey(key, idx) }}
                              aria-hidden
                            />
                            <span className="max-w-[8rem] truncate">{key}</span>
                          </button>
                        );
                      })
                    : null}
                  </div>
                  {lockedClusterKey ? (
                    <div className="flex shrink-0 items-center border-l border-border/50 pl-2 sm:pl-2.5">
                      <button
                        type="button"
                        tabIndex={-1}
                        className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-primary underline-offset-2 outline-none [-webkit-tap-highlight-color:transparent] hover:bg-background/80 hover:underline focus:outline-none focus:ring-0 focus-visible:ring-0 sm:text-xs"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setLockedClusterKey(null)}
                      >
                        Сбросить фильтр
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {allocationsSummaryTab === 'period' && pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет сумм по кластерам для легенды.</p>
            ) : null}
          </div>
        </div>

        <TabsContent value="period" className="mt-4 min-w-0 outline-none focus-visible:ring-0">
          <div className="grid min-h-0 items-start gap-6 lg:grid-cols-2">
            <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">По кластерам</p>
              </div>
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Пока нет сумм — добавьте строки и проценты по инициативам.
                </p>
              ) : (
                <>
                  <div className="relative h-[280px] w-full min-w-0 shrink-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40">
                    {highlightedPieStat ? (
                      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-border bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-md backdrop-blur-sm">
                        <p className="font-medium leading-snug">{highlightedPieStat.name}</p>
                        <p className="mt-1 tabular-nums text-muted-foreground">
                          {Math.round(highlightedPieStat.rub).toLocaleString('ru-RU')} ₽ (
                          {highlightedPieStat.pct.toFixed(1)}%)
                        </p>
                      </div>
                    ) : null}
                    <div
                      className={cn('h-full w-full min-h-0', ALLOCATIONS_RECHARTS_SHELL)}
                      onPointerDownCapture={handleAllocationsChartPointerDownCapture}
                      onPointerUpCapture={handleAllocationsChartPointerCapture}
                    >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 12, right: 12, bottom: 8, left: 12 }}>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="42%"
                          outerRadius="70%"
                          paddingAngle={1.5}
                          /** Убирает фокус с корневого Layer (rootTabIndex по умолчанию 0) — иначе синяя outline у всего пирога. */
                          rootTabIndex={-1}
                          stroke="hsl(var(--border))"
                          strokeWidth={1}
                          label={false}
                          isAnimationActive={chartsAnimating}
                          animationDuration={480}
                          animationEasing="ease-out"
                          activeIndex={pieActiveHighlightIndex}
                          activeShape={pieActiveShape}
                          cursor="pointer"
                          onClick={(_, index) => {
                            const name = pieData[index]?.name;
                            if (name) toggleClusterLock(name);
                          }}
                        >
                          {pieData.map((entry, i) => {
                            const fill = fillForPieSlice(entry, i);
                            const dim = pieFocusKey != null && entry.name !== pieFocusKey;
                            return (
                              <Cell
                                key={entry.name}
                                fill={fill}
                                fillOpacity={dim ? 0.35 : 1}
                                style={{
                                  transition: cellOpacityTransition,
                                  cursor: 'pointer',
                                  outline: 'none',
                                }}
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip
                          content={(props) => <PieAllocationTooltip {...props} totalRub={pieTotalRub} />}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                  {panelClusterKey ? (
                    <div className="mt-3 min-h-0 border-t border-border/50 pt-3">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Стоимость инициатив кластера
                        <span className="ml-1.5 normal-case text-foreground">{panelClusterKey}</span>
                      </p>
                      {highlightedInitiativeRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Нет сумм по выбранному кластеру.</p>
                      ) : (
                        <ul className="max-h-[min(42vh,18rem)] list-none space-y-0 divide-y divide-border/40 overflow-y-auto overscroll-contain text-xs [scrollbar-width:thin]">
                          {highlightedInitiativeRows.map((row) => (
                            <li
                              key={row.initiative}
                              className="flex items-baseline justify-between gap-3 rounded-sm py-2.5 first:pt-1 last:pb-1 transition-colors hover:bg-muted/35"
                            >
                              <span className="min-w-0 flex-1 truncate leading-snug text-foreground">
                                {row.initiative}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                <span className="text-foreground">{row.rub.toLocaleString('ru-RU')} ₽</span>
                                <span className="mx-1.5 text-muted-foreground/70">·</span>
                                <span className="text-muted-foreground">{row.pct.toFixed(1)}%</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="min-h-0 min-w-0 rounded-xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-medium">По инициативам</p>
              {stackData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных для столбцов.</p>
              ) : (
                <div
                  className="w-full min-w-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40"
                  style={{ height: barChartHeight }}
                >
                  <div
                    className={cn('h-full w-full min-h-0', ALLOCATIONS_RECHARTS_SHELL)}
                    onPointerDownCapture={handleAllocationsChartPointerDownCapture}
                    onPointerUpCapture={handleAllocationsChartPointerCapture}
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
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border) / 0.45)"
                        horizontal={false}
                      />
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
                              if (pieFocusKey !== key) return null;
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
                            const dimFromLegend = pieFocusKey != null && key !== pieFocusKey;
                            const dimFromBar =
                              !pieFocusKey &&
                              hoverBarCell != null &&
                              (hoverBarCell.row !== rowIndex || hoverBarCell.key !== key);
                            const dim = pieFocusKey != null ? dimFromLegend : dimFromBar;
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
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="mt-3 min-w-0 outline-none focus-visible:ring-0">
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="mb-2 text-sm font-medium">Распределение по месяцам</p>
            {lockedClusterKey && monthlyBarKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                По выбранному кластеру нет распределённых сумм за этот период.
              </p>
            ) : monthlyChartRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных за выбранные кварталы.</p>
            ) : (
              <div className="w-full min-w-0 overflow-x-auto rounded-xl bg-muted/15 p-2 ring-1 ring-border/40">
                <div
                  className="relative min-w-0"
                  style={
                    monthlyScrollMinWidth > 0 ? { minWidth: monthlyScrollMinWidth } : undefined
                  }
                >
                  {monthlyHoveredLegendStat ? (
                    <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-border bg-popover/95 px-2 py-1.5 text-[11px] text-popover-foreground shadow-sm">
                      <p className="font-medium leading-snug">{monthlyHoveredLegendStat.key}</p>
                      <p className="mt-0.5 tabular-nums text-muted-foreground">
                        {Math.round(monthlyHoveredLegendStat.rub).toLocaleString('ru-RU')} ₽ (
                        {monthlyHoveredLegendStat.pct.toFixed(1)}%)
                      </p>
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      'h-[clamp(160px,27vh,220px)] w-full min-h-[160px]',
                      ALLOCATIONS_RECHARTS_SHELL
                    )}
                    onPointerDownCapture={handleAllocationsChartPointerDownCapture}
                    onPointerUpCapture={handleAllocationsChartPointerCapture}
                  >
                    <MonthlyMorphStackedChart
                      rows={monthlyChartRows}
                      seriesKeys={monthlyBarKeys}
                      getSeriesColor={fillForMonthlyBarKey}
                      xLabelInterval={monthlyXAxisInterval}
                      hoverLegendKey={effectiveMonthlyLegendHoverKey}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
