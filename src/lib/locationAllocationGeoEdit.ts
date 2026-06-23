import type { AdminDataRow, GeoCostSplit, GeoCostSplitEntry } from '@/lib/adminDataManager';
import {
  geoCostSplitPercentsTotal,
  splitTotalIntoIntegerParts,
} from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  allocateCostToMarkets,
  initiativeYearCostRub,
  resolveInitiativeGeoSplit,
} from '@/lib/locationAllocationModel';
import {
  clusterKeyToTopRegion,
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
};

export type GeoHierarchyRegionRow = {
  region: TopRegionLabel;
  percent: number;
  rub: number;
  markets: GeoHierarchyMarketRow[];
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

function activeCatalogCountries(countries: MarketCountryRow[]): MarketCountryRow[] {
  return countries
    .filter((c) => c.is_active)
    .sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru'));
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

/** Проценты по countryId без нормализации к 100%. */
export function getRawPercentByCountryId(
  split: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  scope: UnitMarketScope = 'brands_all'
): Map<string, number> {
  const map = new Map<string, number>();
  if (!split?.entries?.length) return map;

  for (const entry of split.entries) {
    if (entry.kind === 'country') {
      map.set(entry.countryId, (map.get(entry.countryId) ?? 0) + Math.round(entry.percent));
      continue;
    }
    const clusterCountries = countriesInCluster(countries, entry.clusterKey, scope);
    if (clusterCountries.length === 0) continue;
    const weights = clusterCountries.map((c) => revenueWeight(c.label_ru));
    const parts = distributeIntegerPercents(Math.round(entry.percent), weights);
    clusterCountries.forEach((c, i) => {
      const p = parts[i] ?? 0;
      if (p <= 0) return;
      map.set(c.id, (map.get(c.id) ?? 0) + p);
    });
  }

  return map;
}

export function splitFromPercentMap(map: Map<string, number>): GeoCostSplit | undefined {
  const entries = [...map.entries()]
    .filter(([, p]) => p > 0)
    .map(([countryId, percent]) => ({
      kind: 'country' as const,
      countryId,
      percent: Math.round(percent),
    }));
  return entries.length > 0 ? { entries } : undefined;
}

export function expandSplitToCountryEntries(
  split: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplitEntry[] {
  void countryIdToClusterKey;
  const map = getRawPercentByCountryId(split, countries, scope);
  return [...map.entries()]
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
  void countryIdToClusterKey;
  const percentByCountry = getRawPercentByCountryId(split, countries, scope);
  const catalog = activeCatalogCountries(countries);

  const regions: GeoHierarchyRegionRow[] = TOP_REGION_ORDER.map((region) => {
    const regionCountries = catalog.filter(
      (c) => clusterKeyToTopRegion(c.cluster_key) === region
    );

    const markets: GeoHierarchyMarketRow[] = regionCountries.map((c) => {
      const percent = percentByCountry.get(c.id) ?? 0;
      const rub =
        totalCostRub > 0 && percent > 0
          ? Math.round((totalCostRub * percent) / 100)
          : 0;
      return {
        countryId: c.id,
        label: c.label_ru,
        percent,
        rub,
      };
    });

    return {
      region,
      percent: markets.reduce((s, m) => s + m.percent, 0),
      rub: markets.reduce((s, m) => s + m.rub, 0),
      markets,
    };
  }).filter((r) => r.markets.length > 0);

  return regions;
}

export function sumHierarchyPercents(hierarchy: GeoHierarchyRegionRow[]): number {
  return hierarchy.reduce((s, r) => s + r.percent, 0);
}

export function entriesFromHierarchy(
  hierarchy: GeoHierarchyRegionRow[]
): GeoCostSplitEntry[] {
  const entries: GeoCostSplitEntry[] = [];
  for (const region of hierarchy) {
    for (const market of region.markets) {
      if (market.percent <= 0) continue;
      entries.push({
        kind: 'country',
        countryId: market.countryId,
        percent: Math.round(market.percent),
      });
    }
  }
  return entries;
}

export function applyRegionPercentChange(
  split: GeoCostSplit | undefined,
  region: TopRegionLabel,
  newRegionPercent: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplit | undefined {
  void countryIdToClusterKey;
  const percentByCountry = getRawPercentByCountryId(split, countries, scope);
  const catalog = activeCatalogCountries(countries);
  const regionCountries = catalog.filter((c) => clusterKeyToTopRegion(c.cluster_key) === region);
  if (regionCountries.length === 0) return split;

  const target = Math.max(0, Math.min(100, Math.round(newRegionPercent)));
  const weights = regionCountries.map((c) => revenueWeight(c.label_ru));
  const parts = distributeIntegerPercents(target, weights);

  regionCountries.forEach((c, i) => {
    percentByCountry.set(c.id, parts[i] ?? 0);
  });

  return splitFromPercentMap(percentByCountry);
}

export function applyMarketPercentChange(
  split: GeoCostSplit | undefined,
  countryId: string,
  newPercent: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  scope: UnitMarketScope = 'brands_all'
): GeoCostSplit | undefined {
  void countryIdToClusterKey;
  const percentByCountry = getRawPercentByCountryId(split, countries, scope);
  percentByCountry.set(countryId, Math.max(0, Math.min(100, Math.round(newPercent))));
  return splitFromPercentMap(percentByCountry);
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

/** Сумма % только по строкам сплита (legacy). */
export function geoSplitPercentTotal(split: GeoCostSplit | undefined): number {
  return geoCostSplitPercentsTotal(split?.entries ?? []);
}

/** Сумма % по всему справочнику (включая нули). */
export function geoSplitPercentTotalForCatalog(
  split: GeoCostSplit | undefined,
  countries: MarketCountryRow[],
  scope: UnitMarketScope = 'brands_all'
): number {
  const map = getRawPercentByCountryId(split, countries, scope);
  let total = 0;
  for (const c of activeCatalogCountries(countries)) {
    total += map.get(c.id) ?? 0;
  }
  return total;
}
