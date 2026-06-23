import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import { isGeoCostSplitCompleteForCost, marketClusterKeyLabel, rubleAmountsFromGeoPercents } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  allocateCostToClusters,
  allocateCostToMarkets,
  resolveInitiativeGeoSplit,
  quartersForYear,
  initiativeYearCostRub,
} from '@/lib/locationAllocationModel';

/** Снимок выручки по странам: сумма P1M из «Динамика продаж в рублях» (май–июн 2026) + Drinkit из finance snapshot. */
export const REVENUE_RUB_BY_COUNTRY_LABEL: Readonly<Record<string, number>> = {
  Азербайджан: 5_458_476.775,
  Армения: 22_164_091.245,
  Беларусь: 309_476_191.729,
  Болгария: 9_726_473.808,
  Грузия: 15_911_229.387,
  Индонезия: 1_838_495.919,
  Испания: 1_679_340.535,
  Казахстан: 906_756_634.944,
  Катар: 4_321_098.671,
  Кипр: 17_133_921.396,
  Киргизия: 127_311_996.855,
  Кыргызстан: 127_311_996.855,
  Литва: 44_952_479.946,
  Нигерия: 29_925_454.187,
  ОАЭ: 30_194_384.25,
  Польша: 27_537_905.715,
  Россия: 11_585_978_363,
  Румыния: 114_235_586.092,
  Сербия: 11_571_147.387,
  Словения: 18_932_767.999,
  Таджикистан: 69_350_566.545,
  Турция: 77_612_675.515,
  Узбекистан: 54_176_103.648,
  Хорватия: 8_105_049.606,
  Черногория: 12_961_454.601,
  Эстония: 64_500_640.63,
  Drinkit: 577_801_864,
};

export const TOP_REGION_ORDER = [
  'Domestic Region',
  'International Region',
  'Drink It',
] as const;

export type TopRegionLabel = (typeof TOP_REGION_ORDER)[number];

/** Короткие подписи для компактной строки в таймлайне локаций. */
export const TOP_REGION_SHORT_LABELS: Record<TopRegionLabel, string> = {
  'Domestic Region': 'Domestic',
  'International Region': 'International',
  'Drink It': 'Drinkit',
};

/** Подписи в UI (hero-карточки и т.п.). */
export const TOP_REGION_DISPLAY_LABELS: Record<TopRegionLabel, string> = {
  'Domestic Region': 'Domestic Region',
  'International Region': 'International Region',
  'Drink It': 'Drinkit',
};

export type RegionComparisonRow = {
  region: TopRegionLabel;
  planRub: number;
  actualRub: number;
};

export type UnitMarketScope =
  | 'pizza_all'
  | 'pizza_international_only'
  | 'brands_all'
  | 'drinkit_only';

const INTERNATIONAL_CLUSTER_KEYS = new Set([
  'Europe',
  'Turkey',
  'MENA',
  'Other_Countries',
]);

const DOMESTIC_CLUSTER_KEYS = new Set(['Russia', 'Central Asia']);

function revenueRubForCountryLabel(labelRu: string): number {
  return REVENUE_RUB_BY_COUNTRY_LABEL[labelRu] ?? 0;
}

export function clusterKeyToTopRegion(clusterKey: string): TopRegionLabel | null {
  if (DOMESTIC_CLUSTER_KEYS.has(clusterKey)) return 'Domestic Region';
  if (INTERNATIONAL_CLUSTER_KEYS.has(clusterKey)) return 'International Region';
  if (clusterKey === 'Drinkit') return 'Drink It';
  return null;
}

export function clusterLabelToTopRegion(clusterLabel: string): TopRegionLabel | null {
  if (clusterLabel === 'Other Countries') return 'International Region';
  if (clusterLabel === 'Drinkit') return 'Drink It';
  if (clusterLabel === 'Russia' || clusterLabel === 'Central Asia') return 'Domestic Region';
  if (
    clusterLabel === 'Europe' ||
    clusterLabel === 'Turkey' ||
    clusterLabel === 'MENA'
  ) {
    return 'International Region';
  }
  return null;
}

export function clusterLabelsForTopRegion(region: TopRegionLabel): string[] {
  switch (region) {
    case 'Domestic Region':
      return ['Russia', 'Central Asia'];
    case 'International Region':
      return ['Europe', 'Turkey', 'MENA', 'Other Countries'];
    case 'Drink It':
      return ['Drinkit'];
    default:
      return [];
  }
}

export const REGION_URL_SLUG: Record<TopRegionLabel, string> = {
  'Domestic Region': 'domestic',
  'International Region': 'international',
  'Drink It': 'drink-it',
};

const SLUG_TO_REGION = Object.fromEntries(
  TOP_REGION_ORDER.map((r) => [REGION_URL_SLUG[r], r])
) as Record<string, TopRegionLabel>;

export function topRegionFromUrlSlug(slug: string): TopRegionLabel | null {
  if (!slug) return null;
  return SLUG_TO_REGION[slug] ?? null;
}

export function topRegionToUrlSlug(region: TopRegionLabel | null): string {
  if (!region) return '';
  return REGION_URL_SLUG[region];
}

export type CostPieSlice = { name: string; value: number };

/** @deprecated alias */
export type UnitCostBarRow = CostPieSlice;

export type TeamCostBarRow = CostPieSlice & { unit: string; team: string };

export function unitFromUrlParam(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export function unitToUrlParam(unit: string | null): string {
  if (!unit) return '';
  return encodeURIComponent(unit);
}

export function teamFromUrlParam(raw: string): string | null {
  return unitFromUrlParam(raw);
}

export function teamToUrlParam(team: string | null): string {
  return unitToUrlParam(team);
}

export type LocationTeamFilter = { unit: string; team: string };

/** Факт по юнитам: все регионы или один выбранный. */
export function buildUnitCostSlices(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): CostPieSlice[] {
  const yearQuarters = quartersForYear(initiatives, year);
  const acc = new Map<string, number>();

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const factByRegion = allocateInitiativeFactByRegion(
      cost,
      row,
      countries,
      countryIdToClusterKey
    );
    const regionRub =
      region != null
        ? (factByRegion.get(region) ?? 0)
        : [...factByRegion.values()].reduce((s, v) => s + v, 0);

    if (regionRub > 0) {
      const unit = row.unit.trim() || '—';
      acc.set(unit, (acc.get(unit) ?? 0) + regionRub);
    }
  }

  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ru'));
}

export type UnitRegionDetailRow = {
  name: string;
  factRub: number;
  planRub: number;
  deltaRub: number;
  entityTotalRub: number;
  regionBudgetSharePct: number;
  entityRegionSharePct: number;
};

export type MarketDetailRow = UnitRegionDetailRow & {
  countryId: string;
  key: string;
};

export function countryBelongsToTopRegion(
  country: MarketCountryRow,
  region: TopRegionLabel | null,
  countryIdToClusterKey: Map<string, string>
): boolean {
  if (!region) return true;
  const clusterKey = countryIdToClusterKey.get(country.id) ?? country.cluster_key;
  return clusterKeyToTopRegion(clusterKey) === region;
}

type InitiativeLocationAmounts = {
  fact: number;
  plan: number;
  entityTotal: number;
};

function initiativeLocationAmounts(
  row: AdminDataRow,
  cost: number,
  region: TopRegionLabel | null,
  marketCountry: MarketCountryRow | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): InitiativeLocationAmounts {
  if (marketCountry) {
    const factFlat = initiativeFactFlatByMarket(cost, row, countries, countryIdToClusterKey);
    const planFlat = initiativePlanFlatByMarket(cost, row, countries);
    const entityTotal = [...factFlat.values()].reduce((s, v) => s + v, 0);
    return {
      fact: factFlat.get(marketCountry.label_ru) ?? 0,
      plan: planFlat.get(marketCountry.label_ru) ?? 0,
      entityTotal,
    };
  }

  const factByRegion = allocateInitiativeFactByRegion(
    cost,
    row,
    countries,
    countryIdToClusterKey
  );
  const entityTotal = [...factByRegion.values()].reduce((s, v) => s + v, 0);
  const fact = region != null ? (factByRegion.get(region) ?? 0) : entityTotal;

  let plan = 0;
  const scope = resolveUnitMarketScope(row.unit, row.team);
  if (scope) {
    const planByRegion = allocateInitiativeCostByRevenueScope(cost, scope, countries);
    plan =
      region != null
        ? (planByRegion.get(region) ?? 0)
        : [...planByRegion.values()].reduce((s, v) => s + v, 0);
  }

  return { fact, plan, entityTotal };
}

/** Детализация юнитов: выбранный регион или все регионы (overview). */
export function buildUnitDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): UnitRegionDetailRow[] {
  const yearQuarters = quartersForYear(initiatives, year);
  type Acc = { fact: number; plan: number; entityTotal: number };
  const acc = new Map<string, Acc>();

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const unit = row.unit.trim() || '—';
    const { fact, plan, entityTotal } = initiativeLocationAmounts(
      row,
      cost,
      region,
      marketCountry,
      countries,
      countryIdToClusterKey
    );

    if (fact <= 0 && plan <= 0) continue;

    const prev = acc.get(unit) ?? { fact: 0, plan: 0, entityTotal: 0 };
    prev.fact += fact;
    prev.plan += plan;
    prev.entityTotal += entityTotal;
    acc.set(unit, prev);
  }

  const factTotal = [...acc.values()].reduce((s, a) => s + a.fact, 0);

  return [...acc.entries()]
    .map(([name, a]) => ({
      name,
      factRub: a.fact,
      planRub: a.plan,
      deltaRub: a.fact - a.plan,
      entityTotalRub: a.entityTotal,
      regionBudgetSharePct: factTotal > 0 ? (a.fact / factTotal) * 100 : 0,
      entityRegionSharePct:
        region != null && a.entityTotal > 0
          ? (a.fact / a.entityTotal) * 100
          : 100,
    }))
    .filter((r) => r.factRub > 0 || r.planRub > 0)
    .sort((a, b) => b.factRub - a.factRub || b.planRub - a.planRub || a.name.localeCompare(b.name, 'ru'));
}

export function buildUnitRegionDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): UnitRegionDetailRow[] {
  return buildUnitDetailRows(
    initiatives,
    year,
    region,
    countries,
    countryIdToClusterKey,
    marketCountry
  );
}

export function buildUnitOverviewDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): UnitRegionDetailRow[] {
  return buildUnitDetailRows(
    initiatives,
    year,
    null,
    countries,
    countryIdToClusterKey,
    marketCountry
  );
}

export type TeamRegionDetailRow = UnitRegionDetailRow & {
  unit: string;
  team: string;
  key: string;
};

/** Детализация команд: выбранный регион или все регионы (overview). */
export function buildTeamDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel | null,
  unitFilter: string | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): TeamRegionDetailRow[] {
  const yearQuarters = quartersForYear(initiatives, year);
  type Acc = {
    unit: string;
    team: string;
    fact: number;
    plan: number;
    entityTotal: number;
  };
  const acc = new Map<string, Acc>();

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const unit = row.unit.trim() || '—';
    const team = row.team.trim() || '—';
    if (unitFilter && unit !== unitFilter) continue;

    const { fact, plan, entityTotal } = initiativeLocationAmounts(
      row,
      cost,
      region,
      marketCountry,
      countries,
      countryIdToClusterKey
    );

    if (fact <= 0 && plan <= 0) continue;

    const key = `${unit}\t${team}`;
    const prev = acc.get(key) ?? { unit, team, fact: 0, plan: 0, entityTotal: 0 };
    prev.fact += fact;
    prev.plan += plan;
    prev.entityTotal += entityTotal;
    acc.set(key, prev);
  }

  const factTotal = [...acc.values()].reduce((s, a) => s + a.fact, 0);

  return [...acc.values()]
    .map((a) => ({
      key: `${a.unit}\t${a.team}`,
      unit: a.unit,
      team: a.team,
      name: unitFilter ? a.team : `${a.unit} · ${a.team}`,
      factRub: a.fact,
      planRub: a.plan,
      deltaRub: a.fact - a.plan,
      entityTotalRub: a.entityTotal,
      regionBudgetSharePct: factTotal > 0 ? (a.fact / factTotal) * 100 : 0,
      entityRegionSharePct:
        region != null && a.entityTotal > 0
          ? (a.fact / a.entityTotal) * 100
          : 100,
    }))
    .filter((r) => r.factRub > 0 || r.planRub > 0)
    .sort((a, b) => b.factRub - a.factRub || b.planRub - a.planRub || a.name.localeCompare(b.name, 'ru'));
}

export function buildTeamRegionDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel,
  unitFilter: string | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): TeamRegionDetailRow[] {
  return buildTeamDetailRows(
    initiatives,
    year,
    region,
    unitFilter,
    countries,
    countryIdToClusterKey,
    marketCountry
  );
}

export function buildTeamOverviewDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  unitFilter: string | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>,
  marketCountry: MarketCountryRow | null = null
): TeamRegionDetailRow[] {
  return buildTeamDetailRows(
    initiatives,
    year,
    null,
    unitFilter,
    countries,
    countryIdToClusterKey,
    marketCountry
  );
}

/** Стоимость ИТ по рынкам (странам): все рынки каталога в регионе или во всём портфеле. */
export function buildMarketDetailRows(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): MarketDetailRow[] {
  const yearQuarters = quartersForYear(initiatives, year);
  const catalog = countries
    .filter((c) => c.is_active && countryBelongsToTopRegion(c, region, countryIdToClusterKey))
    .sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru'));

  type Acc = { fact: number; plan: number };
  const accByCountryId = new Map<string, Acc>();
  for (const country of catalog) {
    accByCountryId.set(country.id, { fact: 0, plan: 0 });
  }

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const factFlat = initiativeFactFlatByMarket(cost, row, countries, countryIdToClusterKey);
    const planFlat = initiativePlanFlatByMarket(cost, row, countries);

    for (const country of catalog) {
      const fact = factFlat.get(country.label_ru) ?? 0;
      const plan = planFlat.get(country.label_ru) ?? 0;
      if (fact <= 0 && plan <= 0) continue;
      const prev = accByCountryId.get(country.id)!;
      prev.fact += fact;
      prev.plan += plan;
    }
  }

  const factTotal = [...accByCountryId.values()].reduce((s, a) => s + a.fact, 0);

  return catalog
    .map((country) => {
      const totals = accByCountryId.get(country.id)!;
      return {
        key: country.id,
        countryId: country.id,
        name: country.label_ru,
        factRub: totals.fact,
        planRub: totals.plan,
        deltaRub: totals.fact - totals.plan,
        entityTotalRub: totals.fact,
        regionBudgetSharePct: factTotal > 0 ? (totals.fact / factTotal) * 100 : 0,
        entityRegionSharePct: 100,
      };
    })
    .filter((r) => r.factRub > 0 || r.planRub > 0)
    .sort((a, b) => b.factRub - a.factRub || b.planRub - a.planRub || a.name.localeCompare(b.name, 'ru'));
}

/** Факт по командам: все регионы или один; опционально только выбранный юнит. */
export function buildTeamCostSlices(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel | null,
  unitFilter: string | null,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): TeamCostBarRow[] {
  const yearQuarters = quartersForYear(initiatives, year);
  const acc = new Map<string, TeamCostBarRow>();

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const unit = row.unit.trim() || '—';
    const team = row.team.trim() || '—';
    if (unitFilter && unit !== unitFilter) continue;

    const factByRegion = allocateInitiativeFactByRegion(
      cost,
      row,
      countries,
      countryIdToClusterKey
    );
    const regionRub =
      region != null
        ? (factByRegion.get(region) ?? 0)
        : [...factByRegion.values()].reduce((s, v) => s + v, 0);

    if (regionRub > 0) {
      const key = `${unit}\t${team}`;
      const prev = acc.get(key);
      if (prev) {
        prev.value += regionRub;
      } else {
        acc.set(key, {
          unit,
          team,
          name: unitFilter ? team : `${unit} · ${team}`,
          value: regionRub,
        });
      }
    }
  }

  return [...acc.values()]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ru'));
}

/** @deprecated use buildUnitCostSlices */
export function buildUnitCostPieSlicesForRegion(
  initiatives: AdminDataRow[],
  year: number,
  region: TopRegionLabel,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): CostPieSlice[] {
  return buildUnitCostSlices(initiatives, year, region, countries, countryIdToClusterKey);
}

export function buildRegionCostPieSlices(rows: RegionComparisonRow[]): CostPieSlice[] {
  return rows
    .filter((r) => r.actualRub > 0)
    .map((r) => ({ name: r.region, value: r.actualRub }));
}

/** Область рынков по справочнику подразделений (p. Рынок). */
export function resolveUnitMarketScope(unit: string, team: string): UnitMarketScope | null {
  const u = unit.trim();
  const t = team.trim();

  if (u === 'Drinkit' || u === 'IT Drinkit') return 'drinkit_only';
  if (u === 'Office' || u === 'Office IT' || u === 'Corporate IT') return null;

  if (u === 'FAP' && (t === 'Aggregators' || t === 'IMF')) return 'pizza_international_only';

  if (u === 'B2B' || u === 'App&Web' || u === 'App & Web') return 'pizza_all';
  if (u === 'Data Office' && t === 'Product Analytics') return 'pizza_all';

  return 'brands_all';
}

export function countryMatchesScope(country: MarketCountryRow, scope: UnitMarketScope): boolean {
  const ck = country.cluster_key;
  switch (scope) {
    case 'drinkit_only':
      return ck === 'Drinkit';
    case 'pizza_international_only':
      return INTERNATIONAL_CLUSTER_KEYS.has(ck);
    case 'pizza_all':
      return ck !== 'Drinkit';
    case 'brands_all':
      return true;
    default:
      return false;
  }
}

function emptyRegionMap(): Map<TopRegionLabel, number> {
  return new Map(TOP_REGION_ORDER.map((r) => [r, 0]));
}

function addToRegionMap(
  target: Map<TopRegionLabel, number>,
  source: Map<TopRegionLabel, number>
): void {
  for (const [k, v] of source) {
    if (v <= 0) continue;
    target.set(k, (target.get(k) ?? 0) + v);
  }
}

/** Распределение cost по выручке в рамках scope юнита → три региона. */
export function allocateInitiativeCostByRevenueScope(
  costRub: number,
  scope: UnitMarketScope,
  countries: MarketCountryRow[]
): Map<TopRegionLabel, number> {
  const out = emptyRegionMap();
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0) return out;

  const eligible = countries.filter((c) => c.is_active && countryMatchesScope(c, scope));
  const weights = eligible.map((c) => revenueRubForCountryLabel(c.label_ru));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0 || eligible.length === 0) return out;

  const percents = weights.map((w) => (100 * w) / weightSum);
  const rubles = rubleAmountsFromGeoPercents(cost, percents);

  eligible.forEach((country, i) => {
    const rub = rubles[i] ?? 0;
    if (rub <= 0) return;
    const region = clusterKeyToTopRegion(country.cluster_key);
    if (!region) return;
    out.set(region, (out.get(region) ?? 0) + rub);
  });

  return out;
}

/** Факт: geo_cost_split из «Заполнение → Локации» → три региона. */
export function allocateInitiativeCostByGeoSplit(
  costRub: number,
  split: GeoCostSplit | undefined,
  countryIdToClusterKey: Map<string, string>
): Map<TopRegionLabel, number> {
  const out = emptyRegionMap();
  const byCluster = allocateCostToClusters(costRub, split, countryIdToClusterKey);
  for (const [clusterLabel, rub] of byCluster) {
    if (rub <= 0) continue;
    const region = clusterLabelToTopRegion(clusterLabel);
    if (!region) continue;
    out.set(region, (out.get(region) ?? 0) + rub);
  }
  return out;
}

/**
 * Факт для страницы «Локации»: заполненный geo_cost_split (100%) или дефолт
 * «пропорционально выручке» в рамках рынков юнита (как план).
 */
export function allocateInitiativeFactByRegion(
  costRub: number,
  row: AdminDataRow,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): Map<TopRegionLabel, number> {
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0) return emptyRegionMap();

  const split = resolveInitiativeGeoSplit(row);
  if (isGeoCostSplitCompleteForCost(cost, split)) {
    return allocateInitiativeCostByGeoSplit(cost, split, countryIdToClusterKey);
  }

  const scope = resolveUnitMarketScope(row.unit, row.team) ?? 'brands_all';
  return allocateInitiativeCostByRevenueScope(cost, scope, countries);
}

export function buildRegionComparisonRows(
  initiatives: AdminDataRow[],
  year: number,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): RegionComparisonRow[] {
  const yearQuarters = quartersForYear(initiatives, year);
  const planAcc = emptyRegionMap();
  const actualAcc = emptyRegionMap();

  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) continue;

    const scope = resolveUnitMarketScope(row.unit, row.team);
    if (scope) {
      addToRegionMap(planAcc, allocateInitiativeCostByRevenueScope(cost, scope, countries));
    }

    addToRegionMap(
      actualAcc,
      allocateInitiativeFactByRegion(cost, row, countries, countryIdToClusterKey)
    );
  }

  return TOP_REGION_ORDER.map((region) => ({
    region,
    planRub: planAcc.get(region) ?? 0,
    actualRub: actualAcc.get(region) ?? 0,
  }));
}

/** Стоимость инициативы за год, приходящаяся на выбранный регион (факт). */
export function initiativeYearCostInRegion(
  row: AdminDataRow,
  yearQuarters: string[],
  region: TopRegionLabel,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): number {
  const cost = initiativeYearCostRub(row, yearQuarters);
  if (cost <= 0) return 0;
  const byRegion = allocateInitiativeFactByRegion(cost, row, countries, countryIdToClusterKey);
  return byRegion.get(region) ?? 0;
}

/** Факт по всем трём регионам за год (для строки таймлайна). */
export function initiativeFactByAllRegions(
  row: AdminDataRow,
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): Map<TopRegionLabel, number> {
  const cost = initiativeYearCostRub(row, yearQuarters);
  if (cost <= 0) return emptyRegionMap();
  return allocateInitiativeFactByRegion(cost, row, countries, countryIdToClusterKey);
}

/** Факт по кластерам/рынкам за год (для тримапа с фильтром региона). */
export function initiativeFactByAllClusters(
  row: AdminDataRow,
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const cost = initiativeYearCostRub(row, yearQuarters);
  if (cost <= 0) return new Map();
  return allocateInitiativeFactByCluster(cost, row, countries, countryIdToClusterKey);
}

/** Факт по отдельным рынкам (странам), сгруппированным по кластерам — для hover в тримапе аллокаций. */
export type ClusterMarketRubMap = Map<string, Map<string, number>>;

export function initiativeFactMarketsByCluster(
  row: AdminDataRow,
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): ClusterMarketRubMap {
  const cost = initiativeYearCostRub(row, yearQuarters);
  if (cost <= 0) return new Map();
  return allocateInitiativeFactMarketsByCluster(cost, row, countries, countryIdToClusterKey);
}

function clusterLabelForCountry(
  country: MarketCountryRow,
  countryIdToClusterKey: Map<string, string>
): string {
  const clusterKey = countryIdToClusterKey.get(country.id) ?? country.cluster_key;
  return marketClusterKeyLabel(clusterKey);
}

function addClusterMarketRub(
  out: ClusterMarketRubMap,
  clusterLabel: string,
  marketLabel: string,
  rub: number
): void {
  if (rub <= 0) return;
  let markets = out.get(clusterLabel);
  if (!markets) {
    markets = new Map();
    out.set(clusterLabel, markets);
  }
  markets.set(marketLabel, (markets.get(marketLabel) ?? 0) + rub);
}

function distributeRubByRevenueToCountryLabels(
  rub: number,
  eligible: MarketCountryRow[]
): Map<string, number> {
  const out = new Map<string, number>();
  if (rub <= 0 || eligible.length === 0) return out;

  const weights = eligible.map((c) => revenueRubForCountryLabel(c.label_ru));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0) return out;

  const percents = weights.map((w) => (100 * w) / weightSum);
  const rubles = rubleAmountsFromGeoPercents(rub, percents);

  eligible.forEach((country, i) => {
    const part = rubles[i] ?? 0;
    if (part <= 0) return;
    out.set(country.label_ru, (out.get(country.label_ru) ?? 0) + part);
  });

  return out;
}

function countriesForClusterKey(
  clusterKey: string,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): MarketCountryRow[] {
  return countries.filter((c) => {
    if (!c.is_active) return false;
    const ck = countryIdToClusterKey.get(c.id) ?? c.cluster_key;
    return ck === clusterKey;
  });
}

function allocateCostToClusterMarketLabels(
  costRub: number,
  split: GeoCostSplit,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): ClusterMarketRubMap {
  const byKey = allocateCostToMarkets(costRub, split, countryIdToClusterKey);
  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const out: ClusterMarketRubMap = new Map();

  for (const [key, rub] of byKey) {
    if (rub <= 0) continue;

    if (key.startsWith('cluster:')) {
      const clusterKey = key.slice('cluster:'.length);
      const clusterLabel = marketClusterKeyLabel(clusterKey);
      const inCluster = countriesForClusterKey(clusterKey, countries, countryIdToClusterKey);
      for (const [label, part] of distributeRubByRevenueToCountryLabels(rub, inCluster)) {
        addClusterMarketRub(out, clusterLabel, label, part);
      }
      continue;
    }

    const country = countriesById.get(key);
    if (!country) continue;
    addClusterMarketRub(
      out,
      clusterLabelForCountry(country, countryIdToClusterKey),
      country.label_ru,
      rub
    );
  }

  return out;
}

function allocateInitiativeFactMarketsByCluster(
  costRub: number,
  row: AdminDataRow,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): ClusterMarketRubMap {
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0) return new Map();

  const split = resolveInitiativeGeoSplit(row);
  if (isGeoCostSplitCompleteForCost(cost, split)) {
    return allocateCostToClusterMarketLabels(cost, split!, countries, countryIdToClusterKey);
  }

  const scope = resolveUnitMarketScope(row.unit, row.team) ?? 'brands_all';
  const eligible = countries.filter((c) => c.is_active && countryMatchesScope(c, scope));
  const rubByMarket = distributeRubByRevenueToCountryLabels(cost, eligible);
  const out: ClusterMarketRubMap = new Map();

  for (const country of eligible) {
    const rub = rubByMarket.get(country.label_ru) ?? 0;
    addClusterMarketRub(
      out,
      clusterLabelForCountry(country, countryIdToClusterKey),
      country.label_ru,
      rub
    );
  }

  return out;
}

export function initiativeFactFlatByMarket(
  costRub: number,
  row: AdminDataRow,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const nested = allocateInitiativeFactMarketsByCluster(
    costRub,
    row,
    countries,
    countryIdToClusterKey
  );
  const out = new Map<string, number>();
  for (const markets of nested.values()) {
    for (const [label, rub] of markets) {
      if (rub <= 0) continue;
      out.set(label, (out.get(label) ?? 0) + rub);
    }
  }
  return out;
}

function initiativePlanFlatByMarket(
  costRub: number,
  row: AdminDataRow,
  countries: MarketCountryRow[]
): Map<string, number> {
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0) return new Map();

  const scope = resolveUnitMarketScope(row.unit, row.team);
  if (!scope) return new Map();

  const eligible = countries.filter((c) => c.is_active && countryMatchesScope(c, scope));
  return distributeRubByRevenueToCountryLabels(cost, eligible);
}

function allocateInitiativeFactByCluster(
  costRub: number,
  row: AdminDataRow,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const cost = Math.round(Number(costRub) || 0);
  if (cost <= 0) return new Map();

  const split = resolveInitiativeGeoSplit(row);
  if (isGeoCostSplitCompleteForCost(cost, split)) {
    return allocateCostToClusters(cost, split, countryIdToClusterKey);
  }

  const scope = resolveUnitMarketScope(row.unit, row.team) ?? 'brands_all';
  const out = new Map<string, number>();
  const eligible = countries.filter((c) => c.is_active && countryMatchesScope(c, scope));
  const weights = eligible.map((c) => revenueRubForCountryLabel(c.label_ru));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0 || eligible.length === 0) return out;

  const percents = weights.map((w) => (100 * w) / weightSum);
  const rubles = rubleAmountsFromGeoPercents(cost, percents);

  eligible.forEach((country, i) => {
    const rub = rubles[i] ?? 0;
    if (rub <= 0) return;
    const label = marketClusterKeyLabel(country.cluster_key);
    out.set(label, (out.get(label) ?? 0) + rub);
  });

  return out;
}

export function filterLocationTimelineInitiatives(
  initiatives: AdminDataRow[],
  filters: {
    year: number;
    region: TopRegionLabel | null;
    unit: string | null;
    team: LocationTeamFilter | null;
    marketCountry: MarketCountryRow | null;
    countries: MarketCountryRow[];
    countryIdToClusterKey: Map<string, string>;
  }
): AdminDataRow[] {
  const yearQuarters = quartersForYear(initiatives, filters.year);
  return initiatives.filter((row) => {
    if (row.isPortfolioGhost) return false;
    if (filters.unit && row.unit !== filters.unit) return false;
    if (filters.team) {
      if (row.unit !== filters.team.unit || row.team !== filters.team.team) return false;
    }
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost <= 0) return false;
    if (filters.region) {
      const byRegion = allocateInitiativeFactByRegion(
        cost,
        row,
        filters.countries,
        filters.countryIdToClusterKey
      );
      if ((byRegion.get(filters.region) ?? 0) <= 0) return false;
    }
    if (filters.marketCountry) {
      const factFlat = initiativeFactFlatByMarket(
        cost,
        row,
        filters.countries,
        filters.countryIdToClusterKey
      );
      if ((factFlat.get(filters.marketCountry.label_ru) ?? 0) <= 0) return false;
    }
    return true;
  });
}
