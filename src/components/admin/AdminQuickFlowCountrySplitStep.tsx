import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, CheckCircle2, ChevronDown } from 'lucide-react';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import type { AdminDataRow, AdminQuarterData, GeoCostSplit } from '@/lib/adminDataManager';
import {
  cloneGeoCostSplit,
  isGeoCostSplitCompleteForCost,
  marketClusterKeyLabel,
  rubleAmountsForGeoSplit,
  sortStakeholderLabels,
} from '@/lib/adminDataManager';
import { buildCountryIdToClusterMap, type MarketCountryRow } from '@/hooks/useMarketCountries';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Явные цвета сегментов: в SVG Recharts не подхватывает hsl(var(--chart-n)) из CSS.
 * Подборка с хорошим контрастом на светлой и тёмной карточке.
 */
const GEO_CHART_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#ca8a04',
  '#4f46e5',
  '#0d9488',
  '#b45309',
  '#7c3aed',
];

function uniqueSortedQuarters(qs: string[]): string[] {
  return [...new Set(qs.filter(Boolean))].sort(compareQuarters);
}

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  /** Все кварталы каталога (чипы); интервал quick flow задаётся fillQuarters. */
  quartersCatalog: string[];
  countries: MarketCountryRow[];
  onGeoChange: (initiativeId: string, quarter: string, split: GeoCostSplit | undefined) => void;
};

function paidQuartersForRow(row: AdminDataRow, sortedFill: string[]): string[] {
  return sortedFill.filter((q) => (row.quarterlyData[q]?.cost ?? 0) > 0);
}

/** Все кварталы интервала со стоимостью по инициативе имеют сплит на 100%. */
function initiativeGeoCompleteForInterval(r: AdminDataRow, sortedFill: string[]): boolean {
  const paid = paidQuartersForRow(r, sortedFill);
  if (paid.length === 0) return false;
  return paid.every((q) => {
    const qd = r.quarterlyData[q];
    const cost = qd?.cost ?? 0;
    if (cost <= 0) return true;
    return isGeoCostSplitCompleteForCost(cost, qd?.geoCostSplit);
  });
}

function truncateLabel(s: string, max = 44): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function teamCostForQuarter(allRows: AdminDataRow[], q: string): number {
  return allRows.reduce((acc, r) => acc + (r.quarterlyData[q]?.cost ?? 0), 0);
}

function collectRublesByCluster(
  rows: AdminDataRow[],
  sortedFill: string[],
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows) {
    for (const q of sortedFill) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      if (cost <= 0) continue;
      const entries = qd?.geoCostSplit?.entries;
      if (!entries?.length) continue;
      const rubles = rubleAmountsForGeoSplit(cost, entries);
      entries.forEach((e, i) => {
        const ck = e.kind === 'cluster' ? e.clusterKey : countryIdToClusterKey.get(e.countryId) ?? '—';
        const label = marketClusterKeyLabel(ck);
        m.set(label, (m.get(label) ?? 0) + (rubles[i] ?? 0));
      });
    }
  }
  return m;
}

type StackDatum = Record<string, number | string> & { name: string; totalRub: number };

function initiativePercentByCluster(
  rows: AdminDataRow[],
  sortedFill: string[],
  countryIdToClusterKey: Map<string, string>,
  clusterKeys: string[]
): StackDatum[] {
  const out: StackDatum[] = [];
  for (const row of rows) {
    const byC = new Map<string, number>();
    for (const q of sortedFill) {
      const qd = row.quarterlyData[q];
      const cost = qd?.cost ?? 0;
      if (cost <= 0) continue;
      const entries = qd?.geoCostSplit?.entries;
      if (!entries?.length) continue;
      const rubles = rubleAmountsForGeoSplit(cost, entries);
      entries.forEach((e, i) => {
        const ck = e.kind === 'cluster' ? e.clusterKey : countryIdToClusterKey.get(e.countryId) ?? '—';
        const label = marketClusterKeyLabel(ck);
        byC.set(label, (byC.get(label) ?? 0) + (rubles[i] ?? 0));
      });
    }
    const totalRub = [...byC.values()].reduce((a, b) => a + b, 0);
    if (totalRub <= 0) continue;
    const rec: StackDatum = {
      name: truncateLabel(row.initiative || 'Без названия'),
      totalRub,
    };
    for (const c of clusterKeys) {
      rec[c] = ((byC.get(c) ?? 0) / totalRub) * 100;
    }
    out.push(rec);
  }
  return out;
}

export function AdminQuickFlowCountrySplitStep({
  rows,
  fillQuarters,
  quartersCatalog,
  countries,
  onGeoChange,
}: Props) {
  const sortedFill = useMemo(
    () => [...fillQuarters].filter(Boolean).sort(compareQuarters),
    [fillQuarters]
  );

  const sortedFillKey = sortedFill.join('|');
  const sortedFillSet = useMemo(() => new Set(sortedFill), [sortedFill]);

  const chipQuarters = useMemo(() => {
    const cat = uniqueSortedQuarters(quartersCatalog);
    if (cat.length === 0) return sortedFill;
    return uniqueSortedQuarters([...cat, ...sortedFill]);
  }, [quartersCatalog, sortedFill]);

  const countryIdToClusterKey = useMemo(() => buildCountryIdToClusterMap(countries), [countries]);

  const eligibleRows = useMemo(
    () => rows.filter((r) => paidQuartersForRow(r, sortedFill).length > 0),
    [rows, sortedFill]
  );

  const eligibleKey = useMemo(() => eligibleRows.map((r) => r.id).join('|'), [eligibleRows]);

  const [phase, setPhase] = useState<'wizard' | 'overview'>('wizard');
  const [wizardIndex, setWizardIndex] = useState(0);
  const [selectedQuarterKeys, setSelectedQuarterKeys] = useState<string[]>([]);
  /** Двухкликовый выбор интервала (как в превью treemap): первый клик — начало, второй — конец. */
  const [pendingRangeStart, setPendingRangeStart] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);
  const selectionBeforeRangePickRef = useRef<string[] | null>(null);

  /** Кварталы для диаграмм на сводке; по умолчанию = интервал quick flow, можно расширить чипами. */
  const [overviewQuarters, setOverviewQuarters] = useState<string[]>([]);

  useEffect(() => {
    setOverviewQuarters([...sortedFill]);
  }, [sortedFillKey]);

  useEffect(() => {
    setPhase('wizard');
    setWizardIndex(0);
  }, [eligibleKey]);

  const row = eligibleRows[Math.min(wizardIndex, Math.max(0, eligibleRows.length - 1))];

  useLayoutEffect(() => {
    if (!row) {
      setSelectedQuarterKeys([]);
      setPendingRangeStart(null);
      return;
    }
    const paid = chipQuarters.filter((q) => (row.quarterlyData[q]?.cost ?? 0) > 0);
    setSelectedQuarterKeys(paid);
    setPendingRangeStart(null);
    setHoverQuarter(null);
    selectionBeforeRangePickRef.current = null;
    // Только смена инициативы — не пересобираем выбор при смене интервала quick flow (sortedFill).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chipQuarters/row берутся из того же рендера, что и row.id
  }, [row?.id]);

  const selectedSet = useMemo(() => new Set(selectedQuarterKeys), [selectedQuarterKeys]);

  const paidSelectedInChipOrder = useMemo(() => {
    if (!row) return [];
    return chipQuarters.filter(
      (q) => selectedSet.has(q) && (row.quarterlyData[q]?.cost ?? 0) > 0
    );
  }, [row, chipQuarters, selectedSet]);

  const handleQuarterChipClick = useCallback(
    (q: string) => {
      if (!chipQuarters.includes(q)) return;

      if (pendingRangeStart === null) {
        selectionBeforeRangePickRef.current = [...selectedQuarterKeys];
        setPendingRangeStart(q);
        setSelectedQuarterKeys(uniqueSortedQuarters([q]));
        return;
      }

      const start = pendingRangeStart;
      setPendingRangeStart(null);
      setHoverQuarter(null);
      selectionBeforeRangePickRef.current = null;

      const range = filterQuartersInRange(start, q, chipQuarters);
      setSelectedQuarterKeys(uniqueSortedQuarters(range));
    },
    [chipQuarters, pendingRangeStart, selectedQuarterKeys]
  );

  const isInHoverRange = useCallback(
    (q: string) => {
      if (!pendingRangeStart || !hoverQuarter) return false;
      return filterQuartersInRange(pendingRangeStart, hoverQuarter, chipQuarters).includes(q);
    },
    [pendingRangeStart, hoverQuarter, chipQuarters]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingRangeStart !== null && selectionBeforeRangePickRef.current) {
        setSelectedQuarterKeys(selectionBeforeRangePickRef.current);
        selectionBeforeRangePickRef.current = null;
      }
      setPendingRangeStart(null);
      setHoverQuarter(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingRangeStart]);

  const quartersForSummaryCharts = useMemo(() => {
    if (phase !== 'overview') return sortedFill;
    const sel = new Set(overviewQuarters);
    const ordered = chipQuarters.filter((q) => sel.has(q));
    return ordered.length > 0 ? ordered : sortedFill;
  }, [phase, overviewQuarters, chipQuarters, sortedFill]);

  const overviewQuarterSet = useMemo(() => new Set(overviewQuarters), [overviewQuarters]);

  const toggleOverviewQuarter = useCallback(
    (q: string) => {
      setOverviewQuarters((prev) => {
        const s = new Set(prev);
        if (s.has(q)) {
          s.delete(q);
          if (s.size === 0) return prev;
        } else {
          s.add(q);
        }
        return chipQuarters.filter((x) => s.has(x));
      });
    },
    [chipQuarters]
  );

  const pieData = useMemo(() => {
    const m = collectRublesByCluster(rows, quartersForSummaryCharts, countryIdToClusterKey);
    const labels = sortStakeholderLabels([...m.keys()]);
    return labels
      .map((name) => ({ name, value: m.get(name) ?? 0 }))
      .filter((d) => d.value > 0);
  }, [rows, quartersForSummaryCharts, countryIdToClusterKey]);

  const stackClusterKeys = useMemo(() => {
    const m = collectRublesByCluster(rows, quartersForSummaryCharts, countryIdToClusterKey);
    return sortStakeholderLabels([...m.keys()]);
  }, [rows, quartersForSummaryCharts, countryIdToClusterKey]);

  const stackData = useMemo(
    () =>
      initiativePercentByCluster(rows, quartersForSummaryCharts, countryIdToClusterKey, stackClusterKeys),
    [rows, quartersForSummaryCharts, countryIdToClusterKey, stackClusterKeys]
  );

  const formatMetric = (v: string) => (v?.trim() ? v : '—');

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет инициатив для команды.</p>;
  }

  if (eligibleRows.length === 0) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-lg font-semibold">Распределение по странам</h2>
        <p className="text-sm text-muted-foreground">
          В выбранном интервале нет кварталов с ненулевой стоимостью по инициативам этой команды. Распределение не
          требуется.
        </p>
      </section>
    );
  }

  if (phase === 'overview') {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Сводка по интервалу</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setPhase('wizard')}>
            Вернуться к инициативам
          </Button>
        </div>
        <div
          className="flex flex-col gap-1 rounded-xl border border-border/80 bg-muted/10 p-2 dark:bg-muted/5"
          role="group"
          aria-label="Кварталы для сводки"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 px-1">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              Базовый интервал quick flow:{' '}
              <span className="font-medium text-foreground">{sortedFill.join(' · ') || '—'}</span>. Диаграммы считаются
              по выбранным ниже кварталам — клик добавляет или убирает квартал (можно расширить период за пределы
              интервала). Кварталы вне интервала с меткой «+».
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-[11px] text-muted-foreground"
              onClick={() => setOverviewQuarters([...sortedFill])}
            >
              Только интервал
            </Button>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
            {chipQuarters.map((q) => {
              const inBase = sortedFillSet.has(q);
              const isSelected = overviewQuarterSet.has(q);
              const teamCost = teamCostForQuarter(rows, q);
              const hasCost = teamCost > 0;
              return (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant={isSelected ? (inBase ? 'secondary' : 'default') : 'outline'}
                  aria-pressed={isSelected}
                  title={
                    inBase
                      ? `${q}: в интервале quick flow, сумма команды ${Math.round(teamCost).toLocaleString('ru-RU')} ₽`
                      : `${q}: вне интервала — кликните, чтобы включить в сводку (${Math.round(teamCost).toLocaleString('ru-RU')} ₽ по команде)`
                  }
                  onClick={() => toggleOverviewQuarter(q)}
                  className={cn(
                    'h-auto min-h-[2.5rem] min-w-[4.75rem] shrink-0 flex-col justify-center gap-0.5 py-1.5 tabular-nums',
                    !hasCost && 'opacity-45 saturate-50',
                    isSelected &&
                      inBase &&
                      'border-border/80 bg-secondary/90 text-secondary-foreground hover:bg-secondary/80',
                    isSelected &&
                      !inBase &&
                      'border-primary/40 bg-primary/15 text-foreground hover:bg-primary/20 dark:bg-primary/20',
                    !isSelected && !hasCost && 'border-border/40 bg-muted/20 text-muted-foreground',
                    !isSelected && hasCost && 'border-border/80 bg-background/90 text-foreground hover:bg-muted/80'
                  )}
                >
                  <span className="flex items-center justify-center gap-0.5 text-[11px] font-semibold leading-none">
                    {q}
                    {!inBase ? (
                      <span className="text-[9px] font-normal text-muted-foreground" aria-hidden>
                        +
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[9px] font-normal tabular-nums leading-none text-muted-foreground">
                    {hasCost ? `${Math.round(teamCost).toLocaleString('ru-RU')} ₽` : '—'}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Сейчас в диаграммах:{' '}
          <span className="font-medium text-foreground">{quartersForSummaryCharts.join(' · ')}</span>. Учитываются только
          уже заданные строки распределения по странам.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium">По кластерам (команда, ₽)</p>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет сумм — добавьте строки и проценты по инициативам.</p>
            ) : (
              <div className="h-[300px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="rgba(51, 65, 85, 0.2)"
                      strokeWidth={2}
                      label={false}
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={GEO_CHART_PALETTE[i % GEO_CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${Math.round(value).toLocaleString('ru-RU')} ₽`,
                        name,
                      ]}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
            <p className="mb-2 text-sm font-medium">Структура по инициативам (доли кластеров внутри распределённой суммы)</p>
            {stackData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных для столбцов.</p>
            ) : (
              <div className="h-[min(320px,50vh)] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stackData}
                    margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                    />
                    {stackClusterKeys.map((key, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="split"
                        fill={GEO_CHART_PALETTE[i % GEO_CHART_PALETTE.length]}
                      />
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

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Распределение по странам</h2>
          {row ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left -ml-1 text-sm font-medium leading-snug text-foreground ring-offset-background hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]_svg]:rotate-180"
                  aria-label="Выбрать инициативу"
                >
                  <span className="min-w-0 truncate">{row.initiative?.trim() || 'Без названия'}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70 transition-transform" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[min(24rem,70vh)] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Инициатива {wizardIndex + 1} из {eligibleRows.length}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {eligibleRows.map((r, idx) => {
                  const done = initiativeGeoCompleteForInterval(r, sortedFill);
                  return (
                    <DropdownMenuItem
                      key={r.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 py-2',
                        idx === wizardIndex && 'bg-accent/60'
                      )}
                      onSelect={() => setWizardIndex(idx)}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal break-words pr-1 text-sm leading-snug">
                        {r.initiative?.trim() || 'Без названия'}
                      </span>
                      {done ? (
                        <Check
                          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                          aria-label="Распределение по кварталам заполнено"
                        />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPhase('overview')}>
            Сводка
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={wizardIndex <= 0}
            onClick={() => setWizardIndex((i) => Math.max(0, i - 1))}
          >
            Назад
          </Button>
          {wizardIndex < eligibleRows.length - 1 ? (
            <Button type="button" size="sm" onClick={() => setWizardIndex((i) => i + 1)}>
              Дальше — следующая инициатива
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => setPhase('overview')}>
              Итоговая сводка
            </Button>
          )}
        </div>
      </div>

      {row ? (
        <>
          <div
            className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-muted/20 p-2 dark:bg-muted/10"
            role="group"
            aria-label="Кварталы: выбор интервала и редактирование"
          >
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
              {chipQuarters.map((q) => {
                const qd: AdminQuarterData = row.quarterlyData[q] ?? ({} as AdminQuarterData);
                const cost = qd.cost ?? 0;
                const hasCost = cost > 0;
                const inFillInterval = sortedFill.includes(q);
                const isSelected = selectedSet.has(q);
                const isRangeAnchor = pendingRangeStart === q;
                const hoverBand = isInHoverRange(q);
                const geoOk =
                  hasCost && isGeoCostSplitCompleteForCost(cost, qd.geoCostSplit);
                const chipClass = cn(
                  'rounded-md border px-2 py-1.5 text-left transition-colors shrink-0 flex flex-col justify-center gap-0.5 min-h-[2.85rem] min-w-[5rem] tabular-nums ring-offset-background',
                  !hasCost && 'opacity-45 saturate-50',
                  isRangeAnchor
                    ? 'border-primary bg-primary text-primary-foreground ring-1 ring-primary/30'
                    : isSelected
                      ? 'border-foreground bg-foreground text-background'
                      : hoverBand
                        ? 'border-primary/50 bg-primary/25 text-foreground'
                        : cn(
                            'border-border bg-background hover:border-muted-foreground',
                            !hasCost && 'border-border/40 bg-muted/20 text-muted-foreground'
                          )
                );
                return (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={isSelected}
                    title={
                      `${inFillInterval ? '[интервал quick flow] ' : ''}` +
                      (hasCost
                        ? `${q}: ${Math.round(cost).toLocaleString('ru-RU')} ₽`
                        : `${q}: нет стоимости в данных`)
                    }
                    onClick={() => handleQuarterChipClick(q)}
                    onMouseEnter={() => setHoverQuarter(q)}
                    onMouseLeave={() => setHoverQuarter(null)}
                    className={chipClass}
                  >
                    <span className="flex items-center justify-center gap-0.5 text-[11px] font-semibold leading-none">
                      {isSelected ? <Check className="h-3 w-3 shrink-0 opacity-90" aria-hidden /> : null}
                      {q}
                      {geoOk ? (
                        <CheckCircle2
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isRangeAnchor
                              ? 'text-primary-foreground/90'
                              : isSelected
                                ? 'text-background/90'
                                : 'text-emerald-600 dark:text-emerald-500'
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] font-normal tabular-nums leading-none',
                        isRangeAnchor
                          ? 'text-primary-foreground/80'
                          : isSelected
                            ? 'text-background/75'
                            : 'text-muted-foreground'
                      )}
                    >
                      {hasCost ? `${Math.round(cost).toLocaleString('ru-RU')} ₽` : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {paidSelectedInChipOrder.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              В выбранном на чипах диапазоне нет кварталов с затратами по этой инициативе. Расширьте интервал или
              выберите другие кварталы.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {paidSelectedInChipOrder.map((q, qIdx) => {
                const qd: AdminQuarterData = {
                  cost: 0,
                  otherCosts: 0,
                  support: false,
                  onTrack: true,
                  metricPlan: '',
                  metricFact: '',
                  comment: '',
                  effortCoefficient: 0,
                  ...row.quarterlyData[q],
                };
                const cost = qd.cost ?? 0;
                const prevQ = qIdx > 0 ? paidSelectedInChipOrder[qIdx - 1] : null;
                const prevSplit = prevQ ? row.quarterlyData[prevQ]?.geoCostSplit : undefined;
                const canCopyFromPrev = Boolean(prevQ && prevSplit?.entries?.length);

                return (
                  <div
                    key={q}
                    id={`country-split-${row.id}-${q}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm/5 scroll-mt-4"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                      <span className="text-base font-semibold tabular-nums">{q}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {prevQ ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canCopyFromPrev}
                            title={
                              canCopyFromPrev
                                ? `Скопировать страны и проценты из ${prevQ}`
                                : `В квартале ${prevQ} ещё нет распределения по странам`
                            }
                            onClick={() => {
                              if (!canCopyFromPrev) return;
                              onGeoChange(row.id, q, cloneGeoCostSplit(prevSplit));
                            }}
                          >
                            Скопировать из {prevQ}
                          </Button>
                        ) : null}
                        <span className="text-sm text-muted-foreground">
                          Стоимость квартала:{' '}
                          <span className="font-medium text-foreground tabular-nums">
                            {Math.round(cost).toLocaleString('ru-RU')} ₽
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">План (метрика)</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-foreground">{formatMetric(qd.metricPlan)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Факт (метрика)</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-foreground">{formatMetric(qd.metricFact)}</p>
                      </div>
                    </div>
                    <GeoCostSplitEditor
                      cost={cost}
                      value={qd.geoCostSplit}
                      countries={countries}
                      onChange={(next) => onGeoChange(row.id, q, next)}
                      showEntryNotes
                      hideFooterCostLine
                      bulkAddQuarterLabel={q}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
