import {
  type AdminDataRow,
  type GeoCostSplit,
  type GeoCostSplitEntry,
  costForAllocationDisplay,
  geoCostSplitPercentsTotal,
  getInitiativeDisplayName,
  marketClusterKeyLabel,
  rubleAmountsFromGeoPercents,
  sortStakeholderLabels,
  STAKEHOLDERS_LIST,
  stakeholderLabelToClusterKey,
} from '@/lib/adminDataManager';
import {
  applyGeoDriverToSplitEntries,
  GEO_ALLOCATION_DRIVER_BY_KEY,
} from '@/lib/geoAllocationDrivers';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';

export type LocationAllocationLayer = 'as-is' | 'decision';

export type GeoFeedbackStatus = 'ok' | 'question' | 'reject';

export type ClusterRubMap = Map<string, number>;

export type InitiativeClusterRow = {
  initiativeId: string;
  unit: string;
  team: string;
  initiativeLabel: string;
  isTimelineStub: boolean;
  quarterCostRub: number;
  clusterRub: Record<string, number>;
  clusterPercents: Record<string, number>;
};

export type ClusterStackChartRow = Record<string, number | string> & {
  clusterLabel: string;
  totalRub: number;
};

const REVENUE_DRIVER = GEO_ALLOCATION_DRIVER_BY_KEY.geo_driver_revenue;

/** As-Is: распределение по драйверу выручки на все активные страны справочника. */
export function buildAsIsRevenueSplit(countries: MarketCountryRow[]): GeoCostSplit | undefined {
  const active = countries.filter((c) => c.is_active);
  if (active.length === 0) return undefined;
  const countriesById = new Map(active.map((c) => [c.id, c]));
  const entries: GeoCostSplitEntry[] = active.map((c) => ({
    kind: 'country',
    countryId: c.id,
    percent: 0,
  }));
  const next = applyGeoDriverToSplitEntries(entries, countriesById, REVENUE_DRIVER);
  if (!next) return undefined;
  return {
    entries: next,
    driverKey: REVENUE_DRIVER.key,
    driverLabel: REVENUE_DRIVER.fullLabel,
  };
}

export function clusterLabelsOrdered(): string[] {
  return sortStakeholderLabels([...STAKEHOLDERS_LIST]);
}

export function clusterKeyFromLabel(label: string): string {
  return stakeholderLabelToClusterKey(label);
}

/** Сумма cost+other по кварталу для аллокации. */
export function initiativeQuarterCostRub(row: AdminDataRow, quarter: string): number {
  const qd = row.quarterlyData[quarter];
  if (!qd) return 0;
  return costForAllocationDisplay((Number(qd.cost) || 0) + (Number(qd.otherCosts) || 0));
}

function clusterKeyForEntry(
  entry: GeoCostSplitEntry,
  countryIdToClusterKey: Map<string, string>
): string | null {
  if (entry.kind === 'cluster') return entry.clusterKey;
  const ck = countryIdToClusterKey.get(entry.countryId);
  return ck ?? null;
}

/** Рубли по кластерам для cost и сплита (с масштабированием при сумме % ≠ 100). */
export function allocateCostToClusters(
  costRub: number,
  split: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>
): ClusterRubMap {
  const out = new Map<string, number>();
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0 || !split?.entries?.length) return out;

  const totalPercents = geoCostSplitPercentsTotal(split.entries);
  const capped = Math.min(100, totalPercents);
  if (capped <= 0) return out;

  const effectiveCost = Math.round((cost * capped) / 100);
  const scale = capped / totalPercents;
  const scaledPercents = split.entries.map((e) => e.percent * scale);
  const rubles = rubleAmountsFromGeoPercents(effectiveCost, scaledPercents);

  split.entries.forEach((entry, i) => {
    const ck = clusterKeyForEntry(entry, countryIdToClusterKey);
    if (!ck) return;
    const label = marketClusterKeyLabel(ck);
    const rub = rubles[i] ?? 0;
    if (rub <= 0) return;
    out.set(label, (out.get(label) ?? 0) + rub);
  });

  return out;
}

export function clusterPercentsFromSplit(
  split: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>
): Record<string, number> {
  const acc = new Map<string, number>();
  if (!split?.entries?.length) return {};
  for (const e of split.entries) {
    const ck = clusterKeyForEntry(e, countryIdToClusterKey);
    if (!ck) continue;
    const label = marketClusterKeyLabel(ck);
    acc.set(label, (acc.get(label) ?? 0) + (Number.isFinite(e.percent) ? e.percent : 0));
  }
  const out: Record<string, number> = {};
  for (const [k, v] of acc) out[k] = Math.round(v);
  return out;
}

export function resolveEffectiveSplit(
  row: AdminDataRow,
  layer: LocationAllocationLayer,
  asIsSplit: GeoCostSplit | undefined,
  draftSplit?: GeoCostSplit
): GeoCostSplit | undefined {
  if (layer === 'as-is') return asIsSplit;
  if (draftSplit?.entries?.length) return draftSplit;
  if (row.initiativeGeoCostSplit?.entries?.length) return row.initiativeGeoCostSplit;
  return asIsSplit;
}

/** Geo split из вкладки «Локации» (заполнение). Без fallback на выручку. */
export function resolveInitiativeGeoSplit(
  row: AdminDataRow,
  draftSplit?: GeoCostSplit
): GeoCostSplit | undefined {
  if (draftSplit?.entries?.length) return draftSplit;
  if (row.initiativeGeoCostSplit?.entries?.length) return row.initiativeGeoCostSplit;
  return undefined;
}

export function buildInitiativeClusterRows(
  rows: AdminDataRow[],
  quarter: string,
  layer: LocationAllocationLayer,
  asIsSplit: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>,
  draftByInitiativeId?: Map<string, GeoCostSplit>
): InitiativeClusterRow[] {
  const clusterLabels = clusterLabelsOrdered();
  const out: InitiativeClusterRow[] = [];

  for (const row of rows) {
    const quarterCostRub = initiativeQuarterCostRub(row, quarter);
    if (quarterCostRub <= 0) continue;

    const split = resolveEffectiveSplit(
      row,
      layer,
      asIsSplit,
      draftByInitiativeId?.get(row.id)
    );
    const byCluster = allocateCostToClusters(quarterCostRub, split, countryIdToClusterKey);
    const clusterRub: Record<string, number> = {};
    for (const label of clusterLabels) {
      clusterRub[label] = byCluster.get(label) ?? 0;
    }

    out.push({
      initiativeId: row.id,
      unit: row.unit,
      team: row.team,
      initiativeLabel: row.isTimelineStub ? `[${row.team}]` : row.initiative || '—',
      isTimelineStub: row.isTimelineStub ?? false,
      quarterCostRub,
      clusterRub,
      clusterPercents: clusterPercentsFromSplit(split, countryIdToClusterKey),
    });
  }

  out.sort(
    (a, b) =>
      a.unit.localeCompare(b.unit, 'ru') ||
      a.team.localeCompare(b.team, 'ru') ||
      a.initiativeLabel.localeCompare(b.initiativeLabel, 'ru')
  );
  return out;
}

export type StackBreakdown = 'unit' | 'team' | 'initiative';

function stackKeyForRow(row: InitiativeClusterRow, breakdown: StackBreakdown): string {
  if (breakdown === 'unit') return row.unit;
  if (breakdown === 'team') return `${row.unit} / ${row.team}`;
  return row.initiativeLabel;
}

/** Stacked bar: ось X = кластеры, сегменты = unit/team/initiative. */
export function buildClusterStackChartRows(
  initiativeRows: InitiativeClusterRow[],
  breakdown: StackBreakdown,
  visibleClusterLabels?: string[]
): { chartRows: ClusterStackChartRow[]; stackKeys: string[] } {
  const clusterLabels =
    visibleClusterLabels && visibleClusterLabels.length > 0
      ? visibleClusterLabels
      : clusterLabelsOrdered();

  const stackTotals = new Map<string, number>();
  const byCluster = new Map<string, Map<string, number>>();

  for (const label of clusterLabels) {
    byCluster.set(label, new Map());
  }

  for (const row of initiativeRows) {
    const sk = stackKeyForRow(row, breakdown);
    for (const label of clusterLabels) {
      const rub = row.clusterRub[label] ?? 0;
      if (rub <= 0) continue;
      stackTotals.set(sk, (stackTotals.get(sk) ?? 0) + rub);
      const m = byCluster.get(label)!;
      m.set(sk, (m.get(sk) ?? 0) + rub);
    }
  }

  const stackKeys = [...stackTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const chartRows: ClusterStackChartRow[] = clusterLabels.map((clusterLabel) => {
    const m = byCluster.get(clusterLabel) ?? new Map();
    let totalRub = 0;
    const rec: ClusterStackChartRow = { clusterLabel, totalRub: 0 };
    for (const sk of stackKeys) {
      const v = m.get(sk) ?? 0;
      if (v > 0) rec[sk] = v;
      totalRub += v;
    }
    rec.totalRub = totalRub;
    return rec;
  });

  return { chartRows: chartRows.filter((r) => r.totalRub > 0), stackKeys };
}

/** Сравнение as-is vs decision по кластерам (для delta-бара). */
export function buildClusterDeltaRows(
  rows: AdminDataRow[],
  quarter: string,
  asIsSplit: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>,
  draftByInitiativeId?: Map<string, GeoCostSplit>
): Array<{ clusterLabel: string; asIsRub: number; decisionRub: number; deltaRub: number }> {
  const asIsInitiatives = buildInitiativeClusterRows(
    rows,
    quarter,
    'as-is',
    asIsSplit,
    countryIdToClusterKey
  );
  const decisionInitiatives = buildInitiativeClusterRows(
    rows,
    quarter,
    'decision',
    asIsSplit,
    countryIdToClusterKey,
    draftByInitiativeId
  );

  const labels = clusterLabelsOrdered();
  const asIsTot = new Map<string, number>();
  const decTot = new Map<string, number>();

  for (const r of asIsInitiatives) {
    for (const label of labels) {
      asIsTot.set(label, (asIsTot.get(label) ?? 0) + (r.clusterRub[label] ?? 0));
    }
  }
  for (const r of decisionInitiatives) {
    for (const label of labels) {
      decTot.set(label, (decTot.get(label) ?? 0) + (r.clusterRub[label] ?? 0));
    }
  }

  return labels
    .map((clusterLabel) => {
      const asIsRub = asIsTot.get(clusterLabel) ?? 0;
      const decisionRub = decTot.get(clusterLabel) ?? 0;
      return { clusterLabel, asIsRub, decisionRub, deltaRub: decisionRub - asIsRub };
    })
    .filter((r) => r.asIsRub > 0 || r.decisionRub > 0);
}

export function totalQuarterEngineeringRub(
  initiativeRows: InitiativeClusterRow[]
): number {
  return initiativeRows.reduce((s, r) => s + r.quarterCostRub, 0);
}

export function clusterPaysRub(
  initiativeRows: InitiativeClusterRow[],
  clusterLabel: string
): number {
  return initiativeRows.reduce((s, r) => s + (r.clusterRub[clusterLabel] ?? 0), 0);
}

/** Редактирование на уровне кластеров → GeoCostSplit (kind: cluster). */
export function clusterPercentsToGeoSplit(
  percentsByLabel: Record<string, number>
): GeoCostSplit | undefined {
  const entries: GeoCostSplitEntry[] = [];
  for (const [label, raw] of Object.entries(percentsByLabel)) {
    const percent = Math.round(Number(raw) || 0);
    if (percent <= 0) continue;
    entries.push({
      kind: 'cluster',
      clusterKey: clusterKeyFromLabel(label),
      percent,
    });
  }
  if (entries.length === 0) return undefined;
  return { entries };
}

export function filterInitiativeRows(
  rows: AdminDataRow[],
  filters: { unit?: string | null; team?: string | null; clusterLabel?: string | null }
): AdminDataRow[] {
  return rows.filter((row) => {
    if (filters.unit && row.unit !== filters.unit) return false;
    if (filters.team && row.team !== filters.team) return false;
    return true;
  });
}

/** Кварталы одного года, для которых в данных есть cost. */
export function quartersForYear(rows: AdminDataRow[], year: number): string[] {
  const prefix = `${year}-Q`;
  const set = new Set<string>();
  for (const row of rows) {
    for (const q of Object.keys(row.quarterlyData ?? {})) {
      if (q.startsWith(prefix) && initiativeQuarterCostRub(row, q) > 0) set.add(q);
    }
  }
  return [...set].sort();
}

export function initiativeYearCostRub(row: AdminDataRow, quarters: string[]): number {
  return quarters.reduce((s, q) => s + initiativeQuarterCostRub(row, q), 0);
}

/** Рубли по countryId (или pseudo-id для kind:cluster). */
export function allocateCostToMarkets(
  costRub: number,
  split: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const out = new Map<string, number>();
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0 || !split?.entries?.length) return out;

  const totalPercents = geoCostSplitPercentsTotal(split.entries);
  const capped = Math.min(100, totalPercents);
  if (capped <= 0) return out;

  const effectiveCost = Math.round((cost * capped) / 100);
  const scale = capped / totalPercents;
  const scaledPercents = split.entries.map((e) => e.percent * scale);
  const rubles = rubleAmountsFromGeoPercents(effectiveCost, scaledPercents);

  split.entries.forEach((entry, i) => {
    const rub = rubles[i] ?? 0;
    if (rub <= 0) return;
    const key =
      entry.kind === 'country'
        ? entry.countryId
        : `cluster:${entry.clusterKey}`;
    out.set(key, (out.get(key) ?? 0) + rub);
  });

  return out;
}

export type HeroBarMarketSegment = {
  /** countryId или cluster:Key */
  segmentKey: string;
  clusterLabel: string;
  clusterKey: string;
  marketLabel: string;
  rub: number;
};

export function buildYearHeroBarSegments(
  rows: AdminDataRow[],
  year: number,
  layer: LocationAllocationLayer,
  asIsSplit: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): HeroBarMarketSegment[] {
  const yearQuarters = quartersForYear(rows, year);
  if (yearQuarters.length === 0) return [];

  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const acc = new Map<string, HeroBarMarketSegment>();

  for (const row of rows) {
    const yearCost = initiativeYearCostRub(row, yearQuarters);
    if (yearCost <= 0) continue;

    const split = resolveEffectiveSplit(row, layer, asIsSplit);
    const byMarket = allocateCostToMarkets(yearCost, split, countryIdToClusterKey);

    for (const [segmentKey, rub] of byMarket) {
      if (rub <= 0) continue;
      let clusterKey: string;
      let marketLabel: string;

      if (segmentKey.startsWith('cluster:')) {
        clusterKey = segmentKey.slice('cluster:'.length);
        marketLabel = marketClusterKeyLabel(clusterKey);
      } else {
        const c = countriesById.get(segmentKey);
        clusterKey = c?.cluster_key ?? countryIdToClusterKey.get(segmentKey) ?? '—';
        marketLabel = c?.label_ru ?? segmentKey;
      }

      const clusterLabel = marketClusterKeyLabel(clusterKey);
      const prev = acc.get(segmentKey);
      if (prev) {
        prev.rub += rub;
      } else {
        acc.set(segmentKey, {
          segmentKey,
          clusterLabel,
          clusterKey,
          marketLabel,
          rub,
        });
      }
    }
  }

  const clusterOrder = new Map(clusterLabelsOrdered().map((l, i) => [l, i]));
  return [...acc.values()]
    .filter((s) => s.rub > 0)
    .sort((a, b) => {
      const ca = clusterOrder.get(a.clusterLabel) ?? 999;
      const cb = clusterOrder.get(b.clusterLabel) ?? 999;
      if (ca !== cb) return ca - cb;
      return b.rub - a.rub || a.marketLabel.localeCompare(b.marketLabel, 'ru');
    });
}

export function totalYearEngineeringRub(segments: HeroBarMarketSegment[]): number {
  return segments.reduce((s, x) => s + x.rub, 0);
}

export function clusterTotalsFromSegments(
  segments: HeroBarMarketSegment[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of segments) {
    m.set(s.clusterLabel, (m.get(s.clusterLabel) ?? 0) + s.rub);
  }
  return m;
}

export type LocationInitiativeRubRow = {
  id: string;
  name: string;
  totalRub: number;
  byCluster: Map<string, number>;
  /** label_ru рынка → ₽ */
  byMarket: Map<string, number>;
};

export type PieSliceDatum = { name: string; value: number };

export type InitiativeStackDatum = Record<string, number | string> & {
  name: string;
  totalRub: number;
};

/** Целые % по сегментам, сумма = 100 (largest remainder). */
export function integerPercentsByWeights(
  segmentKeys: string[],
  weights: Map<string, number>,
  totalRub: number
): Record<string, number> {
  const w = segmentKeys.map((k) => weights.get(k) ?? 0);
  const s = w.reduce((a, b) => a + b, 0);
  if (s <= 0 || totalRub <= 0) return Object.fromEntries(segmentKeys.map((k) => [k, 0]));
  const exact = w.map((x) => (100 * x) / s);
  const floor = exact.map((x) => Math.floor(x));
  const rem = 100 - floor.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - floor[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  const rec: Record<string, number> = {};
  segmentKeys.forEach((key, i) => {
    rec[key] = out[i] ?? 0;
  });
  return rec;
}

export function buildYearInitiativeRubRows(
  rows: AdminDataRow[],
  year: number,
  layer: LocationAllocationLayer,
  asIsSplit: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): LocationInitiativeRubRow[] {
  const yearQuarters = quartersForYear(rows, year);
  if (yearQuarters.length === 0) return [];

  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const out: LocationInitiativeRubRow[] = [];

  for (const row of rows) {
    const totalRub = initiativeYearCostRub(row, yearQuarters);
    if (totalRub <= 0) continue;

    const split = resolveEffectiveSplit(row, layer, asIsSplit);
    const byCluster = allocateCostToClusters(totalRub, split, countryIdToClusterKey);
    const byMarketRaw = allocateCostToMarkets(totalRub, split, countryIdToClusterKey);
    const byMarket = new Map<string, number>();

    for (const [key, rub] of byMarketRaw) {
      if (rub <= 0) continue;
      let label: string;
      if (key.startsWith('cluster:')) {
        const ck = key.slice('cluster:'.length);
        label = marketClusterKeyLabel(ck);
      } else {
        label = countriesById.get(key)?.label_ru ?? key;
      }
      byMarket.set(label, (byMarket.get(label) ?? 0) + rub);
    }

    out.push({
      id: row.id,
      name: getInitiativeDisplayName(row) || '—',
      totalRub,
      byCluster,
      byMarket,
    });
  }

  return out.sort((a, b) => b.totalRub - a.totalRub);
}

export function buildClusterPieSlices(initiativeRows: LocationInitiativeRubRow[]): PieSliceDatum[] {
  const acc = new Map<string, number>();
  for (const row of initiativeRows) {
    for (const [label, rub] of row.byCluster) {
      if (rub <= 0) continue;
      acc.set(label, (acc.get(label) ?? 0) + rub);
    }
  }
  return sortStakeholderLabels([...acc.keys()])
    .map((name) => ({ name, value: acc.get(name) ?? 0 }))
    .filter((d) => d.value > 0);
}

export function buildMarketPieSlicesForCluster(
  segments: HeroBarMarketSegment[],
  clusterLabel: string
): PieSliceDatum[] {
  return segments
    .filter((s) => s.clusterLabel === clusterLabel && s.rub > 0)
    .map((s) => ({ name: s.marketLabel, value: s.rub }))
    .sort((a, b) => b.value - a.value);
}

export function buildInitiativeStackData(
  initiativeRows: LocationInitiativeRubRow[],
  segmentKeys: string[],
  mode: 'cluster' | 'market',
  clusterFilter?: string | null
): InitiativeStackDatum[] {
  const filtered =
    clusterFilter && mode === 'cluster'
      ? initiativeRows.filter((r) => (r.byCluster.get(clusterFilter) ?? 0) > 0)
      : clusterFilter && mode === 'market'
        ? initiativeRows.filter((r) => {
            const marketsInCluster = segmentKeys;
            return marketsInCluster.some((m) => (r.byMarket.get(m) ?? 0) > 0);
          })
        : initiativeRows;

  return filtered.map((row) => {
    const weights = new Map<string, number>();
    for (const k of segmentKeys) {
      const rub =
        mode === 'cluster'
          ? row.byCluster.get(k) ?? 0
          : row.byMarket.get(k) ?? 0;
      if (rub > 0) weights.set(k, rub);
    }
    const intPct = integerPercentsByWeights(segmentKeys, weights, row.totalRub);
    const rec: InitiativeStackDatum = { name: row.name, totalRub: row.totalRub };
    for (const k of segmentKeys) rec[k] = intPct[k] ?? 0;
    return rec;
  });
}

export function initiativeRowsForCluster(
  initiativeRows: LocationInitiativeRubRow[],
  clusterLabel: string
): Array<{ initiative: string; rub: number; pct: number }> {
  return initiativeRows
    .map((row) => {
      const rub = row.byCluster.get(clusterLabel) ?? 0;
      const pct = row.totalRub > 0 ? (rub / row.totalRub) * 100 : 0;
      return { initiative: row.name, rub, pct };
    })
    .filter((x) => x.rub > 0)
    .sort((a, b) => b.rub - a.rub);
}

export function marketLabelsInCluster(segments: HeroBarMarketSegment[], clusterLabel: string): string[] {
  return segments
    .filter((s) => s.clusterLabel === clusterLabel && s.rub > 0)
    .map((s) => s.marketLabel)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}
