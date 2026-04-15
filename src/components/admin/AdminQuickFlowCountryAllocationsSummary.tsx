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
import { ChevronDown } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const OTHER_INITIATIVE_LABEL = 'Прочие';

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

function rubForRowQuarterInCluster(
  row: AdminDataRow,
  quarter: string,
  countryIdToClusterKey: Map<string, string>,
  clusterLabel: string
): number {
  const qd = row.quarterlyData[quarter];
  const cost = qd?.cost ?? 0;
  const c = Math.round(Number(cost) || 0);
  if (c <= 0) return 0;
  const byCluster = new Map<string, number>();
  const unallocatedAcc = { rub: 0 };
  addQuarterGeoToMaps(cost, qd?.geoCostSplit?.entries, countryIdToClusterKey, byCluster, unallocatedAcc);
  if (clusterLabel === UNALLOCATED_LABEL) return unallocatedAcc.rub;
  return byCluster.get(clusterLabel) ?? 0;
}

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

function buildMonthlyRowsByInitiativesInCluster(
  rows: AdminDataRow[],
  quarters: string[],
  countryIdToClusterKey: Map<string, string>,
  clusterLabel: string,
  topN: number
): { chartRows: MonthStackRow[]; barKeys: string[] } {
  const initiativeTotals = new Map<string, number>();
  for (const row of rows) {
    const name = truncateLabel(row.initiative || 'Без названия');
    let sum = 0;
    for (const q of quarters) {
      sum += rubForRowQuarterInCluster(row, q, countryIdToClusterKey, clusterLabel);
    }
    if (sum > 0) initiativeTotals.set(name, (initiativeTotals.get(name) ?? 0) + sum);
  }
  const sorted = [...initiativeTotals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN).map(([n]) => n);
  const rest = sorted.slice(topN);
  const hasOther = rest.length > 0;
  const barKeys = hasOther ? [...top, OTHER_INITIATIVE_LABEL] : top;
  const topSet = new Set(top);

  const monthOrder = orderedMonthsFromQuarters(quarters);
  const acc = new Map<string, Map<string, number>>();
  for (const { key } of monthOrder) acc.set(key, new Map());

  for (const q of quarters) {
    const mins = quarterToMonthInfos(q);
    if (mins.length === 0) continue;
    for (const row of rows) {
      const rub = rubForRowQuarterInCluster(row, q, countryIdToClusterKey, clusterLabel);
      if (rub <= 0) continue;
      const third = Math.round(rub / 3);
      if (third <= 0) continue;
      const name = truncateLabel(row.initiative || 'Без названия');
      const targetKey =
        hasOther && !topSet.has(name) ? OTHER_INITIATIVE_LABEL : name;
      if (!hasOther && !topSet.has(name)) continue;
      for (const mi of mins) {
        const m = acc.get(mi.key);
        if (m) m.set(targetKey, (m.get(targetKey) ?? 0) + third);
      }
    }
  }

  const chartRows: MonthStackRow[] = monthOrder.map(({ key, label }) => {
    const m = acc.get(key) ?? new Map();
    let totalRub = 0;
    const rec: MonthStackRow = { monthKey: key, monthLabel: label, totalRub: 0 };
    for (const k of barKeys) {
      const v = m.get(k) ?? 0;
      rec[k] = v;
      totalRub += v;
    }
    rec.totalRub = totalRub;
    return rec;
  });

  return { chartRows, barKeys };
}

function formatRubAxis(n: number): string {
  const x = Math.abs(n);
  if (x >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (x >= 1000) return `${Math.round(n / 1000)} тыс`;
  return `${Math.round(n)}`;
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

type MonthlyTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number; dataKey?: string | number }>;
};

function MonthlyStackTooltip({ active, label, payload }: MonthlyTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const segment = String(p.name ?? p.dataKey ?? '');
  const rub = Number(p.value);
  if (!Number.isFinite(rub) || rub <= 0) return null;
  const monthTitle = typeof label === 'string' && label.trim().length > 0 ? label : '—';
  return (
    <div className="max-w-[min(100vw-2rem,18rem)] rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium leading-snug">{monthTitle}</p>
      <p className="mt-1 text-muted-foreground">{segment}</p>
      <p className="mt-1 tabular-nums">{Math.round(rub).toLocaleString('ru-RU')} ₽</p>
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
  lockedKey,
  onHighlightKey,
  onScheduleClearHighlight,
  onToggleClusterLock,
}: {
  payload?: LegendPayloadEntry[];
  pieSlices: PieSliceDatum[];
  pieTotalRub: number;
  highlightedKey: string | null;
  lockedKey: string | null;
  onHighlightKey: (name: string) => void;
  onScheduleClearHighlight: () => void;
  onToggleClusterLock: (name: string) => void;
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
        const fromHover = highlightedKey === name;
        const fromLock = lockedKey === name;
        const emphasized = fromHover || fromLock;
        const isUnalloc = name === UNALLOCATED_LABEL;
        return (
          <button
            key={name}
            type="button"
            aria-label={`${name}${pieTotalRub > 0 ? `, ${pct}%` : ''}`}
            aria-pressed={fromLock}
            className={cn(
              'inline-flex max-w-[min(100%,14rem)] cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 text-[11px] leading-snug outline-none transition-all duration-150',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              fromLock
                ? 'scale-[1.07] bg-muted shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background'
                : emphasized
                  ? 'scale-[1.07] bg-muted shadow-md ring-1 ring-primary/30'
                  : 'hover:bg-muted/60'
            )}
            onClick={(e) => {
              e.preventDefault();
              onToggleClusterLock(name);
            }}
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
            {emphasized ? (
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

  const summaryCatalogQuarters = useMemo(() => {
    const cat = uniqueSortedQuarters(quartersCatalog);
    if (cat.length === 0) return sortedFill;
    return uniqueSortedQuarters([...cat, ...sortedFill]);
  }, [quartersCatalog, sortedFill]);

  const countryIdToClusterKey = useMemo(() => buildCountryIdToClusterMap(countries), [countries]);

  /** Подсветка сегментов от ховера/фокуса легенды. */
  const [highlightedClusterKey, setHighlightedClusterKey] = useState<string | null>(null);
  /** Закрепление кластера кликом по легенде/сектору (пока наведён другой — круг остаётся на закреплённом). */
  const [lockedClusterKey, setLockedClusterKey] = useState<string | null>(null);
  /** Пусто или полный набор кластеров = помесячно «все кластеры»; ровно один = разбивка по инициативам; 2+ = только выбранные кластеры в стеке. */
  const [monthlySelectedClusters, setMonthlySelectedClusters] = useState<string[]>([]);
  const [monthlyClusterPickerOpen, setMonthlyClusterPickerOpen] = useState(false);
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
    setMonthlySelectedClusters((prev) => prev.filter((k) => stackClusterKeys.includes(k)));
  }, [stackClusterKeys]);

  const monthlyAllClusterRows = useMemo(
    () =>
      buildMonthlyRowsByCluster(rows, quartersForCharts, countryIdToClusterKey, stackClusterKeys),
    [rows, quartersForCharts, countryIdToClusterKey, stackClusterKeys]
  );

  const monthlyInitiativeSplit = useMemo(() => {
    if (monthlySelectedClusters.length !== 1) return null;
    return buildMonthlyRowsByInitiativesInCluster(
      rows,
      quartersForCharts,
      countryIdToClusterKey,
      monthlySelectedClusters[0],
      14
    );
  }, [rows, quartersForCharts, countryIdToClusterKey, monthlySelectedClusters]);

  const { monthlyChartRows, monthlyBarKeys } = useMemo(() => {
    const n = monthlySelectedClusters.length;
    if (n === 1) {
      return {
        monthlyChartRows: monthlyInitiativeSplit?.chartRows ?? [],
        monthlyBarKeys: monthlyInitiativeSplit?.barKeys ?? [],
      };
    }
    const fullSet = n === 0 || (stackClusterKeys.length > 0 && n === stackClusterKeys.length);
    if (fullSet) {
      return { monthlyChartRows: monthlyAllClusterRows, monthlyBarKeys: stackClusterKeys };
    }
    const keys = sortStakeholderLabels([...monthlySelectedClusters]);
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
    monthlySelectedClusters,
    stackClusterKeys,
    monthlyAllClusterRows,
    monthlyInitiativeSplit,
    rows,
    quartersForCharts,
    countryIdToClusterKey,
  ]);

  const monthlyPickerSummary = useMemo(() => {
    const n = monthlySelectedClusters.length;
    const full = n === 0 || (stackClusterKeys.length > 0 && n === stackClusterKeys.length);
    if (full) return 'Все кластеры';
    if (n === 1) return monthlySelectedClusters[0];
    const sorted = sortStakeholderLabels([...monthlySelectedClusters]);
    if (sorted.length <= 2) return sorted.join(', ');
    return `${sorted.length} кластеров`;
  }, [monthlySelectedClusters, stackClusterKeys]);

  const toggleMonthlyClusterKey = useCallback((k: string) => {
    setMonthlySelectedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      const arr = sortStakeholderLabels([...next]);
      if (stackClusterKeys.length > 0 && arr.length === stackClusterKeys.length) return [];
      return arr;
    });
  }, [stackClusterKeys]);

  const clearMonthlyClusterSelection = useCallback(() => {
    setMonthlySelectedClusters([]);
  }, []);

  /** Ширина области графика: при длинном ряду месяцев — горизонтальный скролл, высота не от суммы месяцев. */
  const monthlyScrollMinWidth = useMemo(() => {
    const n = monthlyChartRows.length;
    if (n === 0) return 0;
    return Math.min(2600, Math.max(360, n * 28 + 100));
  }, [monthlyChartRows.length]);

  const monthlyMaxRub = useMemo(() => {
    return monthlyChartRows.reduce((m, r) => Math.max(m, r.totalRub), 0);
  }, [monthlyChartRows]);

  const monthlyChartKind = monthlySelectedClusters.length === 1 ? 'initiative' : 'cluster';

  const fillForMonthlyBarKey = useCallback(
    (key: string, idx: number) => {
      if (monthlyChartKind === 'initiative') {
        if (key === OTHER_INITIATIVE_LABEL) return '#94A3B8';
        return GEO_CHART_PALETTE[idx % GEO_CHART_PALETTE.length];
      }
      if (key === UNALLOCATED_LABEL) return UNALLOCATED_FILL;
      const i = stackClusterKeys.indexOf(key);
      return GEO_CHART_PALETTE[(i >= 0 ? i : idx) % GEO_CHART_PALETTE.length];
    },
    [monthlyChartKind, stackClusterKeys]
  );

  const chartsAnimating = false;
  const cellOpacityTransition = pieFocusKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.18s ease';
  const barCellOpacityTransition = pieFocusKey ? 'fill-opacity 80ms ease' : 'fill-opacity 0.15s ease';

  const [allocationsSummaryTab, setAllocationsSummaryTab] = useState<'period' | 'monthly'>('period');
  const [monthlyLegendHoverKey, setMonthlyLegendHoverKey] = useState<string | null>(null);

  const monthlyXAxisInterval = useMemo(() => {
    const n = monthlyChartRows.length;
    if (n > 20) return 2;
    if (n > 12) return 1;
    return 0;
  }, [monthlyChartRows.length]);

  useEffect(() => {
    if (monthlyLegendHoverKey && !monthlyBarKeys.includes(monthlyLegendHoverKey)) {
      setMonthlyLegendHoverKey(null);
    }
  }, [monthlyLegendHoverKey, monthlyBarKeys]);

  const monthlyLegendTotalsByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of monthlyBarKeys) m.set(k, 0);
    for (const row of monthlyChartRows) {
      for (const k of monthlyBarKeys) {
        const v = Number(row[k] ?? 0);
        if (!Number.isFinite(v) || v <= 0) continue;
        m.set(k, (m.get(k) ?? 0) + v);
      }
    }
    return m;
  }, [monthlyBarKeys, monthlyChartRows]);

  const monthlyLegendTotalRub = useMemo(() => {
    return [...monthlyLegendTotalsByKey.values()].reduce((s, v) => s + v, 0);
  }, [monthlyLegendTotalsByKey]);

  const monthlyHoveredLegendStat = useMemo(() => {
    if (!monthlyLegendHoverKey) return null;
    const rub = monthlyLegendTotalsByKey.get(monthlyLegendHoverKey) ?? 0;
    if (rub <= 0) return null;
    const pct = monthlyLegendTotalRub > 0 ? (rub / monthlyLegendTotalRub) * 100 : 0;
    return { key: monthlyLegendHoverKey, rub, pct };
  }, [monthlyLegendHoverKey, monthlyLegendTotalsByKey, monthlyLegendTotalRub]);

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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Итого за период</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {Math.round(pieTotalRub).toLocaleString('ru-RU')} ₽
          </span>
        </div>
        {allocationsSummaryTab === 'monthly' && stackClusterKeys.length > 0 ? (
          <div className="flex w-full min-w-0 shrink-0 justify-end sm:ml-auto sm:w-auto sm:max-w-[min(100%,22rem)]">
            <Popover open={monthlyClusterPickerOpen} onOpenChange={setMonthlyClusterPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full max-w-full justify-between gap-2 font-normal"
                >
                  <span className="min-w-0 flex-1 truncate text-left">{monthlyPickerSummary}</span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[60] w-[min(100vw-2rem,20rem)] p-2">
                <div className="max-h-60 space-y-0.5 overflow-auto pr-1">
                  {stackClusterKeys.map((k) => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={monthlySelectedClusters.includes(k)}
                        onCheckedChange={() => toggleMonthlyClusterKey(k)}
                        aria-label={k}
                      />
                      <span className="min-w-0 flex-1 truncate">{k}</span>
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 w-full text-xs"
                  onClick={() => {
                    clearMonthlyClusterSelection();
                    setMonthlyClusterPickerOpen(false);
                  }}
                >
                  Показать все кластеры
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </div>

      <Tabs
        value={allocationsSummaryTab}
        onValueChange={(v) => setAllocationsSummaryTab(v as 'period' | 'monthly')}
        className="min-h-0 min-w-0"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="period" className="text-xs sm:text-sm">
            За период
          </TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs sm:text-sm">
            По месяцам
          </TabsTrigger>
        </TabsList>

        <TabsContent value="period" className="mt-4 min-w-0">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">По кластерам</p>
                {lockedClusterKey ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setLockedClusterKey(null)}
                  >
                    Сбросить закрепление
                  </button>
                ) : null}
              </div>
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                Клик по сектору или пункту легенды закрепляет кластер; наведение подсвечивает без закрепления.
              </p>
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Пока нет сумм — добавьте строки и проценты по инициативам.
                </p>
              ) : (
                <div className="relative h-[300px] w-full min-w-0 overflow-hidden rounded-xl bg-muted/15 p-2 ring-1 ring-border/40">
                  {highlightedPieStat ? (
                    <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-border bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-md backdrop-blur-sm">
                      <p className="font-medium leading-snug">{highlightedPieStat.name}</p>
                      <p className="mt-1 tabular-nums text-muted-foreground">
                        {Math.round(highlightedPieStat.rub).toLocaleString('ru-RU')} ₽ (
                        {highlightedPieStat.pct.toFixed(1)}%)
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
                        cursor="pointer"
                        onClick={(_, index) => {
                          const name = pieData[index]?.name;
                          if (name) toggleClusterLock(name);
                        }}
                      >
                        {pieData.map((entry, i) => {
                          const paletteIdx = pieData
                            .slice(0, i)
                            .filter((e) => e.name !== UNALLOCATED_LABEL).length;
                          const fill =
                            entry.name === UNALLOCATED_LABEL
                              ? UNALLOCATED_FILL
                              : GEO_CHART_PALETTE[paletteIdx % GEO_CHART_PALETTE.length];
                          const dim = pieFocusKey != null && entry.name !== pieFocusKey;
                          return (
                            <Cell
                              key={entry.name}
                              fill={fill}
                              fillOpacity={dim ? 0.35 : 1}
                              style={{ transition: cellOpacityTransition, cursor: 'pointer' }}
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
                            lockedKey={lockedClusterKey}
                            onHighlightKey={setLegendHighlight}
                            onScheduleClearHighlight={scheduleLegendHighlightClear}
                            onToggleClusterLock={toggleClusterLock}
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
              {panelClusterKey ? (
                <div className="mb-2 rounded-md border border-border bg-popover/70 px-2.5 py-2 text-xs text-popover-foreground">
                  <p className="font-medium leading-snug">
                    {panelClusterKey}
                    {lockedClusterKey === panelClusterKey ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">(закреплено)</span>
                    ) : null}
                  </p>
                  {highlightedInitiativeRows.length === 0 ? (
                    <p className="mt-1 text-muted-foreground">Нет сумм по выбранному кластеру.</p>
                  ) : (
                    <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto pr-1 pb-1">
                      {highlightedInitiativeRows.map((row) => (
                        <p
                          key={row.initiative}
                          className="flex items-center justify-between gap-2 tabular-nums"
                        >
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {row.initiative}
                          </span>
                          <span>
                            {row.rub.toLocaleString('ru-RU')} ₽ · {row.pct.toFixed(1)}%
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Наведите на кластер в легенде или закрепите кликом — список инициатив появится здесь.
                </p>
              )}
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
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="mt-3 min-w-0">
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="mb-2 text-sm font-medium">Распределение по месяцам</p>
            {monthlySelectedClusters.length === 1 && monthlyBarKeys.length === 0 ? (
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
                  <div className="h-[clamp(200px,34vh,320px)] w-full min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyChartRows}
                        margin={{ top: 16, right: 10, left: 10, bottom: 22 }}
                        barCategoryGap="10%"
                        maxBarSize={34}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border) / 0.45)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="monthLabel"
                          type="category"
                          interval={monthlyXAxisInterval}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          height={36}
                        />
                        <YAxis
                          type="number"
                          domain={[0, Math.max(monthlyMaxRub * 1.12, 1)]}
                          tickFormatter={(v) => `${formatRubAxis(Number(v))} ₽`}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          width={62}
                          tickMargin={6}
                        />
                        <Tooltip
                          content={<MonthlyStackTooltip />}
                          cursor={{ fill: 'hsl(var(--muted) / 0.2)' }}
                          shared={false}
                        />
                        {monthlyBarKeys.map((key, idx) => (
                          <Bar
                            key={key}
                            name={key}
                            dataKey={key}
                            stackId="monthly"
                            fill={fillForMonthlyBarKey(key, idx)}
                            isAnimationActive={chartsAnimating}
                            animationDuration={480}
                            animationEasing="ease-out"
                          >
                            {monthlyChartRows.map((_, rowIndex) => {
                              const dim = monthlyLegendHoverKey != null && key !== monthlyLegendHoverKey;
                              return (
                                <Cell
                                  key={`${key}-${rowIndex}`}
                                  fill={fillForMonthlyBarKey(key, idx)}
                                  fillOpacity={dim ? 0.28 : 1}
                                  style={{ transition: 'fill-opacity 120ms ease' }}
                                />
                              );
                            })}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {monthlyBarKeys.length > 0 ? (
                    <div className="flex max-h-16 flex-nowrap gap-x-2 gap-y-1 overflow-x-auto overflow-y-hidden border-t border-border/60 py-2 pl-0.5 pr-1 pt-2">
                      {monthlyBarKeys.map((key, idx) => (
                        <button
                          key={key}
                          type="button"
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background/90 px-2 py-0.5 text-[10px] leading-tight text-foreground shadow-sm transition-colors',
                            monthlyLegendHoverKey === key
                              ? 'border-primary ring-1 ring-primary/40'
                              : 'border-border/70 hover:bg-muted/80'
                          )}
                          title={key}
                          onMouseEnter={() => setMonthlyLegendHoverKey(key)}
                          onMouseLeave={() => setMonthlyLegendHoverKey(null)}
                          onFocus={() => setMonthlyLegendHoverKey(key)}
                          onBlur={() => setMonthlyLegendHoverKey(null)}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-sm ring-1 ring-black/10"
                            style={{ backgroundColor: fillForMonthlyBarKey(key, idx) }}
                            aria-hidden
                          />
                          <span className="max-w-[10rem] truncate">{key}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
