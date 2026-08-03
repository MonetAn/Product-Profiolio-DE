import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { TreeNode } from '@/lib/dataManager';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import {
  allocateInitiativeFactByRegion,
  countryBelongsToTopRegion,
  initiativeFactAllocationSourcesByMarket,
  initiativeFactFlatByMarket,
  initiativeFactMarketsByCluster,
  initiativeFactByAllRegions,
  type LocationAllocationSourceBreakdown,
  type LocationAllocationSourceByMarket,
  TOP_REGION_ORDER,
  TOP_REGION_DISPLAY_LABELS,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { initiativeYearCostRub } from '@/lib/locationAllocationModel';

export type LocationAllocationTreemapScope =
  | { kind: 'all' }
  | { kind: 'region'; region: TopRegionLabel }
  | { kind: 'market'; country: MarketCountryRow };

export function resolveLocationAllocationTreemapScope(
  region: TopRegionLabel | null,
  marketCountry: MarketCountryRow | null
): LocationAllocationTreemapScope {
  if (marketCountry) return { kind: 'market', country: marketCountry };
  if (region) return { kind: 'region', region };
  return { kind: 'all' };
}

export function initiativeScopedCostRub(
  row: AdminDataRow,
  fullCost: number,
  scope: LocationAllocationTreemapScope,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): number {
  if (fullCost <= 0) return 0;
  if (scope.kind === 'market') {
    const flat = initiativeFactFlatByMarket(fullCost, row, countries, countryIdToClusterKey);
    return flat.get(scope.country.label_ru) ?? 0;
  }
  if (scope.kind === 'region') {
    return allocateInitiativeFactByRegion(
      fullCost,
      row,
      countries,
      countryIdToClusterKey
    ).get(scope.region) ?? 0;
  }
  return fullCost;
}

export type LocationAllocationTreemapMeta = {
  yearCostByInitiativeId: Map<string, number>;
  regionBreakdownByInitiativeId: Map<string, Map<TopRegionLabel, number>>;
  clusterMarketBreakdownByInitiativeId: Map<string, Map<string, Map<string, number>>>;
  allocationSourceByMarketByInitiativeId: Map<
    string,
    LocationAllocationSourceByMarket
  >;
  initiativeRowById: Map<string, AdminDataRow>;
};

type RowWithCost = { row: AdminDataRow; cost: number };

function sumChildValues(children: TreeNode[]): number {
  return children.reduce((s, c) => s + (c.value || 0), 0);
}

function initiativeLeaf(row: AdminDataRow, cost: number): TreeNode {
  const isStub = row.isTimelineStub ?? false;
  return {
    name: isStub
      ? row.team
        ? `Не распределено · ${row.team}`
        : 'Не распределено'
      : row.initiative,
    value: cost,
    isInitiative: true,
    unit: row.unit,
    team: row.team,
    adminInitiativeRowId: row.id,
    isTimelineStub: isStub,
    children: [],
  };
}

function rowsWithCost(
  initiatives: AdminDataRow[],
  yearQuarters: string[],
  scope: LocationAllocationTreemapScope,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): RowWithCost[] {
  const out: RowWithCost[] = [];
  for (const row of initiatives) {
    const fullCost = initiativeYearCostRub(row, yearQuarters);
    if (fullCost <= 0) continue;
    const cost = initiativeScopedCostRub(
      row,
      fullCost,
      scope,
      countries,
      countryIdToClusterKey
    );
    if (cost <= 0) continue;
    out.push({ row, cost });
  }
  return out;
}

function buildUnitsOnlyTree(rows: RowWithCost[]): TreeNode {
  const unitMap = new Map<string, number>();
  for (const { row, cost } of rows) {
    unitMap.set(row.unit, (unitMap.get(row.unit) ?? 0) + cost);
  }

  const children: TreeNode[] = [...unitMap.entries()]
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      isUnit: true,
      unit: name,
      children: [],
    }));

  return { name: 'Все Unit', isRoot: true, children };
}

function buildUnitsTeamsTree(rows: RowWithCost[]): TreeNode {
  const unitMap = new Map<
    string,
    { value: number; teamMap: Map<string, number> }
  >();

  for (const { row, cost } of rows) {
    if (!unitMap.has(row.unit)) {
      unitMap.set(row.unit, { value: 0, teamMap: new Map() });
    }
    const unit = unitMap.get(row.unit)!;
    unit.value += cost;
    const teamName = row.team || 'Без команды';
    unit.teamMap.set(teamName, (unit.teamMap.get(teamName) ?? 0) + cost);
  }

  const children: TreeNode[] = [];
  for (const [unitName, unit] of unitMap) {
    if (unit.value <= 0) continue;
    const teams: TreeNode[] = [...unit.teamMap.entries()]
      .filter(([, value]) => value > 0)
      .map(([teamName, value]) => ({
        name: teamName,
        value,
        isTeam: true,
        unit: unitName,
        team: teamName,
        children: [],
      }));
    children.push({
      name: unitName,
      value: unit.value,
      isUnit: true,
      unit: unitName,
      children: teams,
    });
  }

  return { name: 'Все Unit', isRoot: true, children };
}

function buildFullTree(rows: RowWithCost[]): TreeNode {
  const unitMap = new Map<
    string,
    {
      value: number;
      teamMap: Map<string, { value: number; initiatives: TreeNode[] }>;
    }
  >();

  for (const { row, cost } of rows) {
    if (!unitMap.has(row.unit)) {
      unitMap.set(row.unit, { value: 0, teamMap: new Map() });
    }
    const unit = unitMap.get(row.unit)!;
    unit.value += cost;
    const teamName = row.team || 'Без команды';
    if (!unit.teamMap.has(teamName)) {
      unit.teamMap.set(teamName, { value: 0, initiatives: [] });
    }
    const team = unit.teamMap.get(teamName)!;
    team.value += cost;
    team.initiatives.push(initiativeLeaf(row, cost));
  }

  const children: TreeNode[] = [];
  for (const [unitName, unit] of unitMap) {
    if (unit.value <= 0) continue;
    const teams: TreeNode[] = [];
    for (const [teamName, team] of unit.teamMap) {
      if (team.value <= 0) continue;
      teams.push({
        name: teamName,
        value: team.value,
        isTeam: true,
        unit: unitName,
        team: teamName,
        children: team.initiatives.filter((i) => (i.value ?? 0) > 0),
      });
    }
    children.push({
      name: unitName,
      value: unit.value,
      isUnit: true,
      unit: unitName,
      children: teams,
    });
  }

  return { name: 'Все Unit', isRoot: true, children };
}

function buildUnitsInitiativesTree(rows: RowWithCost[]): TreeNode {
  const unitMap = new Map<string, { value: number; initiatives: TreeNode[] }>();

  for (const { row, cost } of rows) {
    if (!unitMap.has(row.unit)) {
      unitMap.set(row.unit, { value: 0, initiatives: [] });
    }
    const unit = unitMap.get(row.unit)!;
    unit.value += cost;
    unit.initiatives.push(initiativeLeaf(row, cost));
  }

  const children: TreeNode[] = [];
  for (const [unitName, unit] of unitMap) {
    if (unit.value <= 0) continue;
    children.push({
      name: unitName,
      value: unit.value,
      isUnit: true,
      unit: unitName,
      children: unit.initiatives.filter((i) => (i.value ?? 0) > 0),
    });
  }

  return { name: 'Все Unit', isRoot: true, children };
}

/** Дерево Unit → Team → Initiative для страницы аллокаций (не buildBudgetTree). */
export function buildLocationAllocationTreemapTree(
  initiatives: AdminDataRow[],
  yearQuarters: string[],
  options: { showTeams: boolean; showInitiatives: boolean },
  scope: LocationAllocationTreemapScope = { kind: 'all' },
  countries: MarketCountryRow[] = [],
  countryIdToClusterKey: Map<string, string> = new Map()
): TreeNode {
  const rows = rowsWithCost(initiatives, yearQuarters, scope, countries, countryIdToClusterKey);
  const { showTeams, showInitiatives } = options;

  if (!showTeams && !showInitiatives) return buildUnitsOnlyTree(rows);
  if (showTeams && !showInitiatives) return buildUnitsTeamsTree(rows);
  if (showTeams && showInitiatives) return buildFullTree(rows);
  return buildUnitsInitiativesTree(rows);
}

function normalizeInitiativeLeaves(children: TreeNode[]): TreeNode[] {
  return children.filter((c) => (c.value || 0) > 0);
}

function normalizeTeamNode(team: TreeNode): TreeNode | null {
  const initiatives = normalizeInitiativeLeaves(team.children ?? []);
  const teamValue =
    initiatives.length > 0 ? sumChildValues(initiatives) : team.value || 0;
  if (teamValue <= 0) return null;
  return {
    ...team,
    isTeam: true,
    value: teamValue,
    children: initiatives.length > 0 ? initiatives : undefined,
  };
}

function normalizeUnitNode(unit: TreeNode): TreeNode | null {
  const rawChildren = unit.children ?? [];

  if (rawChildren.length === 0) {
    const unitValue = unit.value || 0;
    if (unitValue <= 0) return null;
    return { ...unit, isUnit: true, value: unitValue, children: [] };
  }

  if (rawChildren[0]?.isInitiative) {
    const initiatives = normalizeInitiativeLeaves(rawChildren);
    const unitValue = sumChildValues(initiatives) || unit.value || 0;
    if (unitValue <= 0) return null;
    return { ...unit, isUnit: true, value: unitValue, children: initiatives };
  }

  const teams = rawChildren
    .map(normalizeTeamNode)
    .filter((t): t is TreeNode => t != null);
  const unitValue = sumChildValues(teams) || unit.value || 0;
  if (unitValue <= 0) return null;
  return { ...unit, isUnit: true, value: unitValue, children: teams };
}

/** Нормализация value на промежуточных узлах перед раскладкой. */
export function prepareLocationAllocationTreemapTree(root: TreeNode): TreeNode {
  if (!root.children?.length) return root;
  const children = root.children
    .map(normalizeUnitNode)
    .filter((node): node is TreeNode => node != null);
  return { ...root, children };
}

export function buildLocationAllocationTreemapMeta(
  initiatives: AdminDataRow[],
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): LocationAllocationTreemapMeta {
  const yearCostByInitiativeId = new Map<string, number>();
  const regionBreakdownByInitiativeId = new Map<string, Map<TopRegionLabel, number>>();
  const clusterMarketBreakdownByInitiativeId = new Map<
    string,
    Map<string, Map<string, number>>
  >();
  const allocationSourceByMarketByInitiativeId = new Map<
    string,
    LocationAllocationSourceByMarket
  >();
  const initiativeRowById = new Map<string, AdminDataRow>();

  for (const row of initiatives) {
    const yearCost = initiativeYearCostRub(row, yearQuarters);
    if (yearCost <= 0) continue;
    initiativeRowById.set(row.id, row);
    yearCostByInitiativeId.set(row.id, yearCost);
    regionBreakdownByInitiativeId.set(
      row.id,
      initiativeFactByAllRegions(row, yearQuarters, countries, countryIdToClusterKey)
    );
    clusterMarketBreakdownByInitiativeId.set(
      row.id,
      initiativeFactMarketsByCluster(row, yearQuarters, countries, countryIdToClusterKey)
    );
    allocationSourceByMarketByInitiativeId.set(
      row.id,
      initiativeFactAllocationSourcesByMarket(
        yearCost,
        row,
        countries,
        countryIdToClusterKey
      )
    );
  }

  return {
    yearCostByInitiativeId,
    regionBreakdownByInitiativeId,
    clusterMarketBreakdownByInitiativeId,
    allocationSourceByMarketByInitiativeId,
    initiativeRowById,
  };
}

function normalizeTreemapTeamName(team: string | undefined): string {
  const trimmed = (team ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Без команды';
}

export function collectLocationTreemapInitiativeIds(
  node: TreemapLayoutNode,
  meta: LocationAllocationTreemapMeta
): string[] {
  const rowId = node.data.adminInitiativeRowId;
  if (rowId) return [rowId];

  const fromChildren = (node.children ?? []).flatMap((child) =>
    collectLocationTreemapInitiativeIds(child, meta)
  );
  if (fromChildren.length > 0) return fromChildren;

  const unitName = node.isUnit ? node.name : node.data.unit;
  const teamName = node.isTeam ? node.name : node.data.team;
  if (!unitName && !teamName) return [];

  const normalizedTeam = teamName ? normalizeTreemapTeamName(teamName) : null;
  const ids: string[] = [];
  for (const [id, row] of meta.initiativeRowById) {
    if (unitName && row.unit !== unitName) continue;
    if (normalizedTeam && normalizeTreemapTeamName(row.team) !== normalizedTeam) continue;
    ids.push(id);
  }
  return ids;
}

export type LocationTreemapDecisionAnnotation = {
  comment: string | null;
  inheritedFrom: string | null;
};

function treemapNodeLevel(node: TreemapLayoutNode): 'unit' | 'team' | 'initiative' {
  if (node.isInitiative || node.data.isInitiative) return 'initiative';
  if (node.isTeam || node.data.isTeam) return 'team';
  return 'unit';
}

/** Общий комментарий блока и краткое пояснение, если решение пришло от родителя. */
export function resolveLocationTreemapDecisionAnnotation(
  node: TreemapLayoutNode,
  ids: string[],
  meta: LocationAllocationTreemapMeta
): LocationTreemapDecisionAnnotation {
  if (ids.length === 0) return { comment: null, inheritedFrom: null };

  const splits = ids.map((id) => meta.initiativeRowById.get(id)?.initiativeGeoCostSplit);
  const firstSplit = splits[0];
  const firstComment = firstSplit?.note?.trim() ?? '';
  const commonComment =
    firstComment && splits.every((split) => (split?.note?.trim() ?? '') === firstComment)
      ? firstComment
      : null;

  const firstOrigin = firstSplit?.allocationOrigin;
  const commonOrigin =
    firstOrigin &&
    splits.every(
      (split) => JSON.stringify(split?.allocationOrigin ?? null) === JSON.stringify(firstOrigin)
    )
      ? firstOrigin
      : null;

  const nodeLevel = treemapNodeLevel(node);
  const nodeLevelRank = nodeLevel === 'unit' ? 0 : nodeLevel === 'team' ? 1 : 2;
  const originLevel = commonOrigin?.level ?? 'initiative';
  const originLevelRank = originLevel === 'unit' ? 0 : originLevel === 'team' ? 1 : 2;
  const firstRow = meta.initiativeRowById.get(ids[0]);
  const originContextMatches =
    commonOrigin?.level === 'unit'
      ? firstRow?.unit === commonOrigin.unit
      : commonOrigin?.level === 'team'
        ? firstRow?.unit === commonOrigin.unit &&
          normalizeTreemapTeamName(firstRow?.team) ===
            normalizeTreemapTeamName(commonOrigin.team)
        : commonOrigin?.level === 'initiative'
          ? ids.length === 1 && ids[0] === commonOrigin.initiativeId
          : nodeLevel === 'initiative';
  const originAppliesToNode = originContextMatches && originLevelRank <= nodeLevelRank;

  if (!originAppliesToNode) {
    return { comment: null, inheritedFrom: null };
  }

  const inheritedFrom =
    commonOrigin?.level === 'unit' && nodeLevelRank > 0
      ? `Коэффициенты от юнита «${commonOrigin.unit}»`
      : commonOrigin?.level === 'team' && nodeLevel === 'initiative'
        ? `Коэффициенты от команды «${commonOrigin.team}»`
        : null;

  return {
    comment: commonComment,
    inheritedFrom,
  };
}

export function sumLocationTreemapRegionBreakdown(
  ids: string[],
  meta: LocationAllocationTreemapMeta
): Map<TopRegionLabel, number> {
  const out = new Map<TopRegionLabel, number>();
  for (const id of ids) {
    const breakdown = meta.regionBreakdownByInitiativeId.get(id);
    if (!breakdown) continue;
    for (const region of TOP_REGION_ORDER) {
      const rub = breakdown.get(region) ?? 0;
      if (rub <= 0) continue;
      out.set(region, (out.get(region) ?? 0) + rub);
    }
  }
  return out;
}

export type LocationTreemapClusterMarketGroup = {
  clusterLabel: string;
  totalRub: number;
  markets: Array<{ label: string; rub: number }>;
};

export function sumLocationTreemapClusterMarketBreakdown(
  ids: string[],
  meta: LocationAllocationTreemapMeta,
  filter?: {
    scope: LocationAllocationTreemapScope;
    countries: MarketCountryRow[];
    countryIdToClusterKey: Map<string, string>;
  }
): LocationTreemapClusterMarketGroup[] {
  const merged = new Map<string, Map<string, number>>();

  for (const id of ids) {
    const breakdown = meta.clusterMarketBreakdownByInitiativeId.get(id);
    if (!breakdown) continue;
    for (const [clusterLabel, markets] of breakdown) {
      let clusterMap = merged.get(clusterLabel);
      if (!clusterMap) {
        clusterMap = new Map();
        merged.set(clusterLabel, clusterMap);
      }
      for (const [marketLabel, rub] of markets) {
        if (rub <= 0) continue;
        if (filter && !marketMatchesTreemapScope(marketLabel, filter)) continue;
        clusterMap.set(marketLabel, (clusterMap.get(marketLabel) ?? 0) + rub);
      }
    }
  }

  return [...merged.entries()]
    .map(([clusterLabel, markets]) => {
      const marketRows = [...markets.entries()]
        .filter(([, rub]) => rub > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([label, rub]) => ({ label, rub }));
      const totalRub = marketRows.reduce((s, m) => s + m.rub, 0);
      return { clusterLabel, totalRub, markets: marketRows };
    })
    .filter((group) => group.markets.length > 0)
    .sort((a, b) => b.totalRub - a.totalRub);
}

function marketMatchesTreemapScope(
  marketLabel: string,
  filter: {
    scope: LocationAllocationTreemapScope;
    countries: MarketCountryRow[];
    countryIdToClusterKey: Map<string, string>;
  }
): boolean {
  const country = filter.countries.find((c) => c.label_ru === marketLabel);
  if (!country) return filter.scope.kind === 'all';

  if (filter.scope.kind === 'market') {
    return country.id === filter.scope.country.id;
  }
  if (filter.scope.kind === 'region') {
    return countryBelongsToTopRegion(
      country,
      filter.scope.region,
      filter.countryIdToClusterKey
    );
  }
  return true;
}

export function sumLocationTreemapAllocationSourceBreakdown(
  ids: string[],
  meta: LocationAllocationTreemapMeta,
  scope: LocationAllocationTreemapScope,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): LocationAllocationSourceBreakdown {
  const out: LocationAllocationSourceBreakdown = {
    revenueRub: 0,
    manualRub: 0,
  };

  for (const id of ids) {
    const byMarket = meta.allocationSourceByMarketByInitiativeId.get(id);
    if (!byMarket) continue;
    for (const [marketLabel, breakdown] of byMarket) {
      if (
        scope.kind !== 'all' &&
        !marketMatchesTreemapScope(marketLabel, {
          scope,
          countries,
          countryIdToClusterKey,
        })
      ) {
        continue;
      }
      out.revenueRub += breakdown.revenueRub;
      out.manualRub += breakdown.manualRub;
    }
  }

  return out;
}

export function resolveLocationTreemapNodeScopedCost(
  node: TreemapLayoutNode,
  meta: LocationAllocationTreemapMeta,
  scope: LocationAllocationTreemapScope,
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): number {
  if (scope.kind === 'all') {
    return resolveLocationTreemapNodeYearCost(node, meta);
  }
  const layoutValue = node.value ?? 0;
  const rowId = node.data.adminInitiativeRowId;
  if (rowId) {
    const full = meta.yearCostByInitiativeId.get(rowId) ?? 0;
    const row = meta.initiativeRowById.get(rowId);
    if (row && full > 0) {
      return initiativeScopedCostRub(row, full, scope, countries, countryIdToClusterKey);
    }
  }
  const ids = collectLocationTreemapInitiativeIds(node, meta);
  if (ids.length === 0) return layoutValue;
  let sum = 0;
  for (const id of ids) {
    const full = meta.yearCostByInitiativeId.get(id) ?? 0;
    const row = meta.initiativeRowById.get(id);
    if (!row || full <= 0) continue;
    sum += initiativeScopedCostRub(row, full, scope, countries, countryIdToClusterKey);
  }
  return sum > 0 ? sum : layoutValue;
}

export function treemapScopeLabel(scope: LocationAllocationTreemapScope): string | null {
  if (scope.kind === 'region') return TOP_REGION_DISPLAY_LABELS[scope.region];
  if (scope.kind === 'market') return scope.country.label_ru;
  return null;
}

export function sumLocationTreemapYearCost(
  ids: string[],
  meta: LocationAllocationTreemapMeta,
  fallback = 0
): number {
  if (ids.length === 0) return fallback;
  const sum = ids.reduce((s, id) => s + (meta.yearCostByInitiativeId.get(id) ?? 0), 0);
  return sum > 0 ? sum : fallback;
}

/** Стоимость узла treemap аллокаций: meta по id, агрегат поддерева или value раскладки. */
export function resolveLocationTreemapNodeYearCost(
  node: TreemapLayoutNode,
  meta: LocationAllocationTreemapMeta
): number {
  const layoutValue = node.value ?? 0;
  const rowId = node.data.adminInitiativeRowId;
  if (rowId) {
    const fromMeta = meta.yearCostByInitiativeId.get(rowId);
    if (fromMeta != null && fromMeta > 0) return fromMeta;
  }
  const ids = collectLocationTreemapInitiativeIds(node, meta);
  return sumLocationTreemapYearCost(ids, meta, layoutValue);
}
