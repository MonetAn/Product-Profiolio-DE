import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { TreeNode } from '@/lib/dataManager';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import {
  initiativeFactByAllClusters,
  initiativeFactByAllRegions,
  TOP_REGION_ORDER,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { initiativeYearCostRub } from '@/lib/locationAllocationModel';

export type LocationAllocationTreemapMeta = {
  yearCostByInitiativeId: Map<string, number>;
  regionBreakdownByInitiativeId: Map<string, Map<TopRegionLabel, number>>;
  clusterBreakdownByInitiativeId: Map<string, Map<string, number>>;
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

function rowsWithCost(initiatives: AdminDataRow[], yearQuarters: string[]): RowWithCost[] {
  const out: RowWithCost[] = [];
  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost > 0) out.push({ row, cost });
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
  options: { showTeams: boolean; showInitiatives: boolean }
): TreeNode {
  const rows = rowsWithCost(initiatives, yearQuarters);
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
  const clusterBreakdownByInitiativeId = new Map<string, Map<string, number>>();
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
    clusterBreakdownByInitiativeId.set(
      row.id,
      initiativeFactByAllClusters(row, yearQuarters, countries, countryIdToClusterKey)
    );
  }

  return {
    yearCostByInitiativeId,
    regionBreakdownByInitiativeId,
    clusterBreakdownByInitiativeId,
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

export function sumLocationTreemapClusterBreakdown(
  ids: string[],
  meta: LocationAllocationTreemapMeta
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ids) {
    const breakdown = meta.clusterBreakdownByInitiativeId.get(id);
    if (!breakdown) continue;
    for (const [label, rub] of breakdown) {
      if (rub <= 0) continue;
      out.set(label, (out.get(label) ?? 0) + rub);
    }
  }
  return out;
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
