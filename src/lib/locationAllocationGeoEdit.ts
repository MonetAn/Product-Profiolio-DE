import type { AdminDataRow, GeoCostSplit, GeoCostSplitEntry } from '@/lib/adminDataManager';
import {
  geoCostSplitPercentsTotal,
  marketClusterKeyLabel,
  rubleAmountsFromGeoPercents,
  splitTotalIntoIntegerParts,
} from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  allocateCostToMarkets,
  clusterKeyFromLabel,
  initiativeYearCostRub,
  resolveInitiativeGeoSplit,
} from '@/lib/locationAllocationModel';
import {
  clusterLabelToTopRegion,
  clusterLabelsForTopRegion,
  countryMatchesScope,
  resolveUnitMarketScope,
  REVENUE_RUB_BY_COUNTRY_LABEL,
  TOP_REGION_DISPLAY_LABELS,
  TOP_REGION_ORDER,
  type TopRegionLabel,
  type UnitMarketScope,
} from '@/lib/locationRegionModel';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type { LocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import { collectLocationTreemapInitiativeIds } from '@/lib/locationAllocationTreemap';

export type LocationAllocationGeoEditLevel = 'initiative' | 'team' | 'unit';

export type LocationAllocationGeoEditTarget = {
  level: LocationAllocationGeoEditLevel;
  title: string;
  breadcrumb: string;
  description: string;
  initiativeIds: string[];
  initiatives: AdminDataRow[];
  totalCostRub: number;
  initialSplit: GeoCostSplit | undefined;
};

export type GeoHierarchyMarketRow = {
  countryId: string;
  label: string;
  percent: number;
  rub: number;
  entryIndex: number;
};

export type GeoHierarchyClusterRow = {
  clusterLabel: string;
  clusterKey: string;
  percent: number;
  rub: number;
  markets: GeoHierarchyMarketRow[];
};

export type GeoHierarchyRegionRow = {
  region: TopRegionLabel;
  percent: number;
  rub: number;
  clusters: GeoHierarchyClusterRow[];
};

function revenueWeight(labelRu: string): number {
  return REVENUE_RUB_BY_COUNTRY_LABEL[labelRu] ?? 0;
}

function countriesInCluster(
  countries: MarketCountryRow[],
  clusterKey: string,
  scope: UnitMarketScope
): MarketCountryRow[] {
  return countries.filter(
    (c) => c.is_active && c.cluster_key === clusterKey && countryMatchesScope(c, scope)
  );
}

function distributeIntegerPercents(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return splitTotalIntoIntegerParts(total, weights.length);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

export function buildRevenueDefaultGeoSplit(
  row: AdminDataRow,
  countries: MarketCountryRow[]
): GeoCostSplit | undefined {
  const scope = resolveUnitMarketScope(row.unit, row.team) ?? 'brands_all';
  const eligible = countries.filter((c) => c.is_active && countryMatchesScope(c, scope));
  if (eligible.length === 0) return undefined;
  const weights = eligible.map((c) => revenueWeight(c.label_ru));
  const percents = distributeIntegerPercents(100, weights);
  const entries: GeoCostSplitEntry[] = eligible.map((c, i) => ({
    kind: 'country',
    countryId: c.id,
    percent: percents[i] ?? 0,
  }));
  return { entries: entries.filter((e) => e.percent > 0) };
}

function effectiveSplitForInitiative(
  row: AdminDataRow,
  countries: MarketCountryRow[]
): GeoCostSplit | undefined {
  const saved = resolveInitiativeGeoSplit(row);
  if (saved?.entries?.length) return saved;
  return buildRevenueDefaultGeoSplit(row, countries);
}

export function expandSplitToCountryEntries(
  split: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplitEntry[] {
  if (!split?.entries?.length) return [];

  const acc = new Map<string, number>();

  for (const entry of split.entries) {
    if (entry.kind === 'country') {
      acc.set(entry.countryId, (acc.get(entry.countryId) ?? 0) + entry.percent);
      continue;
    }
    const clusterCountries = countriesInCluster(countries, entry.clusterKey, scope);
    if (clusterCountries.length === 0) continue;
    const weights = clusterCountries.map((c) => revenueWeight(c.label_ru));
    const parts = distributeIntegerPercents(Math.round(entry.percent), weights);
    clusterCountries.forEach((c, i) => {
      const p = parts[i] ?? 0;
      if (p <= 0) return;
      acc.set(c.id, (acc.get(c.id) ?? 0) + p);
    });
  }

  void countryIdToClusterKey;

  return [...acc.entries()]
    .filter(([, p]) => p > 0)
    .map(([countryId, percent]) => ({ kind: 'country' as const, countryId, percent }));
}

export function normalizeGeoSplitEntries(entries: GeoCostSplitEntry[]): GeoCostSplitEntry[] {
  const acc = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'country') continue;
    acc.set(e.countryId, (acc.get(e.countryId) ?? 0) + Math.round(e.percent));
  }
  const raw = [...acc.entries()].filter(([, p]) => p > 0);
  const total = raw.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return [];
  if (total === 100) {
    return raw.map(([countryId, percent]) => ({ kind: 'country', countryId, percent }));
  }
  const weights = raw.map(([, p]) => p);
  const normalized = distributeIntegerPercents(100, weights);
  return raw.map(([countryId], i) => ({
    kind: 'country' as const,
    countryId,
    percent: normalized[i] ?? 0,
  }));
}

export function aggregateGeoSplitFromInitiatives(
  initiatives: AdminDataRow[],
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): { totalCostRub: number; split: GeoCostSplit | undefined } {
  const rubByCountry = new Map<string, number>();
  let totalCostRub = 0;

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;
    totalCostRub += cost;
    const split = effectiveSplitForInitiative(row, countries);
    const expanded = expandSplitToCountryEntries(
      split,
      countries,
      countryIdToClusterKey,
      resolveUnitMarketScope(row.unit, row.team) ?? 'brands_all'
    );
    const byMarket = allocateCostToMarkets(cost, { entries: expanded }, countryIdToClusterKey);
    for (const [key, rub] of byMarket) {
      if (!key.startsWith('cluster:')) {
        rubByCountry.set(key, (rubByCountry.get(key) ?? 0) + rub);
      }
    }
  }

  if (totalCostRub <= 0) return { totalCostRub: 0, split: undefined };

  const weights = [...rubByCountry.entries()].map(([countryId, rub]) => ({
    countryId,
    rub,
  }));
  const percents = distributeIntegerPercents(
    100,
    weights.map((w) => w.rub)
  );
  const entries: GeoCostSplitEntry[] = weights
    .map((w, i) => ({
      kind: 'country' as const,
      countryId: w.countryId,
      percent: percents[i] ?? 0,
    }))
    .filter((e) => e.percent > 0);

  return {
    totalCostRub,
    split: entries.length > 0 ? { entries } : undefined,
  };
}

export function buildGeoHierarchy(
  split: GeoCostSplit | undefined,
  totalCostRub: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoHierarchyRegionRow[] {
  const entries = normalizeGeoSplitEntries(
    expandSplitToCountryEntries(split, countries, countryIdToClusterKey, scope)
  );
  if (entries.length === 0 || totalCostRub <= 0) return [];

  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const rubles = rubleAmountsFromGeoPercents(totalCostRub, entries.map((e) => e.percent));

  const marketRows: GeoHierarchyMarketRow[] = entries.map((e, index) => {
    const country = countriesById.get(e.countryId);
    return {
      countryId: e.countryId,
      label: country?.label_ru ?? e.countryId,
      percent: e.percent,
      rub: rubles[index] ?? 0,
      entryIndex: index,
    };
  });

  const clusterMap = new Map<string, GeoHierarchyClusterRow>();
  for (const market of marketRows) {
    const country = countriesById.get(market.countryId);
    const clusterKey = country?.cluster_key ?? countryIdToClusterKey.get(market.countryId) ?? '—';
    const clusterLabel = marketClusterKeyLabel(clusterKey);
    if (!clusterMap.has(clusterLabel)) {
      clusterMap.set(clusterLabel, {
        clusterLabel,
        clusterKey,
        percent: 0,
        rub: 0,
        markets: [],
      });
    }
    const cluster = clusterMap.get(clusterLabel)!;
    cluster.markets.push(market);
    cluster.percent += market.percent;
    cluster.rub += market.rub;
  }

  const regionMap = new Map<TopRegionLabel, GeoHierarchyRegionRow>();
  for (const cluster of clusterMap.values()) {
    const region = clusterLabelToTopRegion(cluster.clusterLabel);
    if (!region) continue;
    if (!regionMap.has(region)) {
      regionMap.set(region, {
        region,
        percent: 0,
        rub: 0,
        clusters: [],
      });
    }
    const regionRow = regionMap.get(region)!;
    regionRow.clusters.push(cluster);
    regionRow.percent += cluster.percent;
    regionRow.rub += cluster.rub;
  }

  return TOP_REGION_ORDER.filter((r) => regionMap.has(r)).map((r) => {
    const row = regionMap.get(r)!;
    row.clusters.sort(
      (a, b) =>
        clusterLabelsForTopRegion(r).indexOf(a.clusterLabel) -
          clusterLabelsForTopRegion(r).indexOf(b.clusterLabel) ||
        a.clusterLabel.localeCompare(b.clusterLabel, 'ru')
    );
    row.clusters.forEach((c) => {
      c.markets.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    });
    return row;
  });
}

export function entriesFromHierarchy(
  hierarchy: GeoHierarchyRegionRow[]
): GeoCostSplitEntry[] {
  const entries: GeoCostSplitEntry[] = [];
  for (const region of hierarchy) {
    for (const cluster of region.clusters) {
      for (const market of cluster.markets) {
        if (market.percent <= 0) continue;
        entries.push({
          kind: 'country',
          countryId: market.countryId,
          percent: Math.round(market.percent),
        });
      }
    }
  }
  return normalizeGeoSplitEntries(entries);
}

export function applyRegionPercentChange(
  split: GeoCostSplit | undefined,
  region: TopRegionLabel,
  newRegionPercent: number,
  totalCostRub: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplit | undefined {
  const hierarchy = buildGeoHierarchy(split, totalCostRub, countries, countryIdToClusterKey, scope);
  const regionRow = hierarchy.find((r) => r.region === region);
  if (!regionRow) return split;

  const oldPercent = regionRow.percent;
  const delta = Math.round(newRegionPercent) - oldPercent;
  if (delta === 0) return split;

  const otherRegions = hierarchy.filter((r) => r.region !== region);
  const otherTotal = otherRegions.reduce((s, r) => s + r.percent, 0);
  if (otherTotal <= 0 && delta !== 0) {
    regionRow.percent = Math.max(0, Math.min(100, Math.round(newRegionPercent)));
    redistributeRegionByRevenue(regionRow, countries, scope);
    return { entries: entriesFromHierarchy(hierarchy) };
  }

  regionRow.percent = Math.max(0, Math.min(100, Math.round(newRegionPercent)));
  const remaining = 100 - regionRow.percent;
  if (otherTotal > 0) {
    for (const other of otherRegions) {
      other.percent = Math.round((other.percent * remaining) / otherTotal);
    }
    fixPercentTotal(hierarchy);
  }

  for (const row of hierarchy) {
    redistributeRegionByRevenue(row, countries, scope);
  }

  return { entries: entriesFromHierarchy(hierarchy) };
}

export function applyClusterPercentChange(
  split: GeoCostSplit | undefined,
  clusterLabel: string,
  newClusterPercent: number,
  totalCostRub: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplit | undefined {
  const hierarchy = buildGeoHierarchy(split, totalCostRub, countries, countryIdToClusterKey, scope);
  const region = clusterLabelToTopRegion(clusterLabel);
  if (!region) return split;
  const regionRow = hierarchy.find((r) => r.region === region);
  if (!regionRow) return split;
  const clusterRow = regionRow.clusters.find((c) => c.clusterLabel === clusterLabel);
  if (!clusterRow) return split;

  const oldPercent = clusterRow.percent;
  const delta = Math.round(newClusterPercent) - oldPercent;
  if (delta === 0) return split;

  const siblings = regionRow.clusters.filter((c) => c.clusterLabel !== clusterLabel);
  const siblingTotal = siblings.reduce((s, c) => s + c.percent, 0);

  clusterRow.percent = Math.max(0, Math.min(100, Math.round(newClusterPercent)));
  const remaining = Math.max(0, regionRow.percent - clusterRow.percent);

  if (siblingTotal > 0) {
    for (const sibling of siblings) {
      sibling.percent = Math.round((sibling.percent * remaining) / siblingTotal);
    }
    const clusterSum = regionRow.clusters.reduce((s, c) => s + c.percent, 0);
    const clusterDelta = regionRow.percent - clusterSum;
    if (clusterDelta !== 0 && regionRow.clusters.length > 0) {
      regionRow.clusters[0].percent += clusterDelta;
    }
  }

  redistributeClusterByRevenue(clusterRow, countries, scope);
  for (const sibling of siblings) {
    redistributeClusterByRevenue(sibling, countries, scope);
  }

  return { entries: entriesFromHierarchy(hierarchy) };
}

export function applyMarketPercentChange(
  split: GeoCostSplit | undefined,
  countryId: string,
  newPercent: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplit | undefined {
  const entries = normalizeGeoSplitEntries(
    expandSplitToCountryEntries(split, countries, countryIdToClusterKey, scope)
  );
  const idx = entries.findIndex((e) => e.countryId === countryId);
  if (idx < 0) return split;

  const old = entries[idx].percent;
  const delta = Math.round(newPercent) - old;
  if (delta === 0) return split;

  entries[idx].percent = Math.max(0, Math.min(100, Math.round(newPercent)));
  const others = entries.filter((e) => e.countryId !== countryId);
  const otherTotal = others.reduce((s, e) => s + e.percent, 0);
  const remaining = 100 - entries[idx].percent;

  if (otherTotal > 0) {
    for (const e of others) {
      e.percent = Math.round((e.percent * remaining) / otherTotal);
    }
  }

  const normalized = normalizeGeoSplitEntries(entries);
  return normalized.length > 0 ? { entries: normalized } : undefined;
}

function fixPercentTotal(hierarchy: GeoHierarchyRegionRow[]): void {
  const sum = hierarchy.reduce((s, r) => s + r.percent, 0);
  const delta = 100 - sum;
  if (delta !== 0 && hierarchy.length > 0) {
    hierarchy[0].percent += delta;
  }
}

function redistributeRegionByRevenue(
  regionRow: GeoHierarchyRegionRow,
  countries: MarketCountryRow[],
  scope: UnitMarketScope
): void {
  const labels = clusterLabelsForTopRegion(regionRow.region);
  const existingLabels = new Set(regionRow.clusters.map((c) => c.clusterLabel));
  for (const label of labels) {
    if (existingLabels.has(label)) continue;
    regionRow.clusters.push({
      clusterLabel: label,
      clusterKey: clusterKeyFromLabel(label),
      percent: 0,
      rub: 0,
      markets: [],
    });
  }

  const activeLabels = labels.filter((label) =>
    regionRow.clusters.some((c) => c.clusterLabel === label)
  );
  if (activeLabels.length === 0) return;

  const weights = activeLabels.map((label) => {
    const ck = clusterKeyFromLabel(label);
    return countriesInCluster(countries, ck, scope).reduce(
      (s, c) => s + revenueWeight(c.label_ru),
      0
    );
  });
  const parts = distributeIntegerPercents(regionRow.percent, weights);
  activeLabels.forEach((label, i) => {
    const cluster = regionRow.clusters.find((c) => c.clusterLabel === label);
    if (!cluster) return;
    cluster.percent = parts[i] ?? 0;
    redistributeClusterByRevenue(cluster, countries, scope);
  });

  regionRow.clusters = regionRow.clusters.filter((c) => c.percent > 0 || c.markets.length > 0);
}

function redistributeClusterByRevenue(
  clusterRow: GeoHierarchyClusterRow,
  countries: MarketCountryRow[],
  scope: UnitMarketScope
): void {
  const clusterCountries = countriesInCluster(countries, clusterRow.clusterKey, scope);
  if (clusterCountries.length === 0) {
    clusterRow.markets = [];
    clusterRow.rub = 0;
    return;
  }

  const weights = clusterCountries.map((c) => revenueWeight(c.label_ru));
  const parts = distributeIntegerPercents(clusterRow.percent, weights);

  clusterRow.markets = clusterCountries.map((c, i) => ({
    countryId: c.id,
    label: c.label_ru,
    percent: parts[i] ?? 0,
    rub: 0,
    entryIndex: i,
  }));
}

export function resolveGeoEditTargetFromNode(
  node: TreemapLayoutNode,
  meta: LocationAllocationTreemapMeta,
  initiativesById: Map<string, AdminDataRow>,
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): LocationAllocationGeoEditTarget | null {
  const ids = collectLocationTreemapInitiativeIds(node, meta);
  const initiatives = ids
    .map((id) => initiativesById.get(id))
    .filter((r): r is AdminDataRow => r != null)
    .filter((r) => initiativeYearCostRub(r, yearQuarters) > 0);

  if (initiatives.length === 0) return null;

  const { totalCostRub, split } = aggregateGeoSplitFromInitiatives(
    initiatives,
    yearQuarters,
    countries,
    countryIdToClusterKey
  );

  if (node.isInitiative && initiatives.length === 1) {
    const row = initiatives[0];
    return {
      level: 'initiative',
      title: row.initiative,
      breadcrumb: `${row.unit} › ${row.team || 'Без команды'}`,
      description: row.description?.trim() ?? '',
      initiativeIds: [row.id],
      initiatives,
      totalCostRub,
      initialSplit: effectiveSplitForInitiative(row, countries),
    };
  }

  if (node.isTeam || (node.data.isTeam && !node.isUnit)) {
    const unit = node.data.unit ?? initiatives[0]?.unit ?? '';
    const team = node.isTeam ? node.name : node.data.team ?? node.name;
    return {
      level: 'team',
      title: team,
      breadcrumb: unit,
      description: '',
      initiativeIds: initiatives.map((r) => r.id),
      initiatives,
      totalCostRub,
      initialSplit: split,
    };
  }

  if (node.isUnit || node.data.isUnit) {
    const unit = node.isUnit ? node.name : node.data.unit ?? node.name;
    return {
      level: 'unit',
      title: unit,
      breadcrumb: 'Dodo Engineering',
      description: '',
      initiativeIds: initiatives.map((r) => r.id),
      initiatives,
      totalCostRub,
      initialSplit: split,
    };
  }

  return null;
}

export function scopeLabelForLevel(level: LocationAllocationGeoEditLevel): string {
  switch (level) {
    case 'initiative':
      return 'инициатива';
    case 'team':
      return 'команда';
    case 'unit':
      return 'юнит';
    default:
      return 'объект';
  }
}

export function regionDisplayLabel(region: TopRegionLabel): string {
  return TOP_REGION_DISPLAY_LABELS[region];
}

export function geoSplitPercentTotal(split: GeoCostSplit | undefined): number {
  return geoCostSplitPercentsTotal(split?.entries ?? []);
}
