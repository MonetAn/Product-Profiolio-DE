import * as d3 from 'd3';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { TreeNode } from '@/lib/dataManager';
import { adjustBrightness } from '@/lib/dataManager';
import {
  initiativeFactByAllRegions,
  TOP_REGION_DISPLAY_LABELS,
  TOP_REGION_ORDER,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { initiativeYearCostRub } from '@/lib/locationAllocationModel';

export const LOCATION_SUNBURST_REGION_COLORS: Record<TopRegionLabel, string> = {
  'Domestic Region': '#5B8FD4',
  'International Region': '#E1942F',
  'Drink It': '#6B9E78',
};

export type SunburstLayoutNode = {
  key: string;
  name: string;
  depth: number;
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  color: string;
  data: TreeNode;
  unit?: string;
  team?: string;
  isUnit?: boolean;
  isTeam?: boolean;
  isInitiative?: boolean;
  isLocationRegion?: boolean;
};

type RowWithCost = { row: AdminDataRow; cost: number };

function rowsWithCost(initiatives: AdminDataRow[], yearQuarters: string[]): RowWithCost[] {
  const out: RowWithCost[] = [];
  for (const row of initiatives) {
    const cost = initiativeYearCostRub(row, yearQuarters);
    if (cost > 0) out.push({ row, cost });
  }
  return out;
}

function initiativeWithRegions(
  row: AdminDataRow,
  cost: number,
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): TreeNode {
  const isStub = row.isTimelineStub ?? false;
  const byRegion = initiativeFactByAllRegions(
    row,
    yearQuarters,
    countries,
    countryIdToClusterKey
  );

  const children: TreeNode[] = TOP_REGION_ORDER.map((region) => ({
    name: TOP_REGION_DISPLAY_LABELS[region],
    value: byRegion.get(region) ?? 0,
    isLocationRegion: true,
    unit: row.unit,
    team: row.team,
    adminInitiativeRowId: row.id,
    children: [],
  })).filter((node) => (node.value ?? 0) > 0);

  if (children.length === 0 && cost > 0) {
    children.push({
      name: 'Не распределено',
      value: cost,
      isLocationRegion: true,
      unit: row.unit,
      team: row.team,
      adminInitiativeRowId: row.id,
      children: [],
    });
  }

  return {
    name: isStub
      ? row.team
        ? `Не распределено · ${row.team}`
        : 'Не распределено'
      : row.initiative,
    isInitiative: true,
    unit: row.unit,
    team: row.team,
    adminInitiativeRowId: row.id,
    isTimelineStub: isStub,
    children,
  };
}

/** Unit → Team → Initiative → Region для кругового тримапа. */
export function buildLocationAllocationSunburstTree(
  initiatives: AdminDataRow[],
  yearQuarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): TreeNode {
  const rows = rowsWithCost(initiatives, yearQuarters);
  const unitMap = new Map<
    string,
    {
      teamMap: Map<string, TreeNode[]>;
    }
  >();

  for (const { row, cost } of rows) {
    if (!unitMap.has(row.unit)) {
      unitMap.set(row.unit, { teamMap: new Map() });
    }
    const unit = unitMap.get(row.unit)!;
    const teamName = row.team || 'Без команды';
    if (!unit.teamMap.has(teamName)) {
      unit.teamMap.set(teamName, []);
    }
    unit.teamMap
      .get(teamName)!
      .push(initiativeWithRegions(row, cost, yearQuarters, countries, countryIdToClusterKey));
  }

  const children: TreeNode[] = [];
  for (const [unitName, unit] of unitMap) {
    const teams: TreeNode[] = [];
    for (const [teamName, initiativesInTeam] of unit.teamMap) {
      if (initiativesInTeam.length === 0) continue;
      teams.push({
        name: teamName,
        isTeam: true,
        unit: unitName,
        team: teamName,
        children: initiativesInTeam,
      });
    }
    if (teams.length === 0) continue;
    children.push({
      name: unitName,
      isUnit: true,
      unit: unitName,
      children: teams,
    });
  }

  return { name: 'Все Unit', isRoot: true, children };
}

function resolveUnitName(node: d3.HierarchyNode<TreeNode>): string {
  let current: d3.HierarchyNode<TreeNode> | null = node;
  while (current) {
    if (current.data.isUnit) return current.data.name;
    current = current.parent;
  }
  return node.data.unit ?? node.data.name;
}

function resolveRegionColor(name: string): string {
  for (const region of TOP_REGION_ORDER) {
    if (TOP_REGION_DISPLAY_LABELS[region] === name) {
      return LOCATION_SUNBURST_REGION_COLORS[region];
    }
  }
  return '#94a3b8';
}

function resolveNodeColor(
  node: d3.HierarchyNode<TreeNode>,
  unitName: string,
  getUnitColor: (name: string) => string
): string {
  if (node.data.isLocationRegion) return resolveRegionColor(node.data.name);
  const base = getUnitColor(unitName);
  if (node.data.isUnit) return base;
  if (node.data.isTeam) return adjustBrightness(base, -15);
  if (node.data.isInitiative) return adjustBrightness(base, -30);
  return base;
}

export function layoutLocationAllocationSunburst(
  data: TreeNode,
  size: number,
  innerRadius: number,
  ringWidth: number,
  getUnitColor: (name: string) => string
): { nodes: SunburstLayoutNode[]; totalValue: number } {
  if (!data.children?.length || size <= 0) {
    return { nodes: [], totalValue: 0 };
  }

  const root = d3
    .hierarchy(data)
    .sum((d) => ((d.children && d.children.length > 0 ? 0 : d.value) || 0))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  d3.partition<TreeNode>().size([2 * Math.PI, root.height + 1])(root);

  const totalValue = root.value ?? 0;
  const nodes: SunburstLayoutNode[] = [];

  root.descendants().forEach((node) => {
    if (node.depth === 0) return;
    const unitName = resolveUnitName(node);
    const depthIndex = node.depth - 1;
    const y0 = innerRadius + depthIndex * ringWidth;
    const y1 = y0 + ringWidth;

    nodes.push({
      key: `${node.depth}-${node
        .ancestors()
        .reverse()
        .map((a) => a.data.name)
        .join('/')}`,
      name: node.data.name,
      depth: node.depth,
      value: node.value ?? 0,
      x0: node.x0,
      x1: node.x1,
      y0,
      y1,
      color: resolveNodeColor(node, unitName, getUnitColor),
      data: node.data,
      unit: node.data.unit,
      team: node.data.team,
      isUnit: node.data.isUnit,
      isTeam: node.data.isTeam,
      isInitiative: node.data.isInitiative,
      isLocationRegion: node.data.isLocationRegion,
    });
  });

  return { nodes, totalValue };
}

export function sunburstArcPath(node: SunburstLayoutNode): string {
  const arc = d3
    .arc<SunburstLayoutNode>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .innerRadius((d) => d.y0)
    .outerRadius((d) => d.y1)
    .padAngle(0.004)
    .cornerRadius(1);

  return arc(node) ?? '';
}
