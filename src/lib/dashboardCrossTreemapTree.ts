import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  buildBudgetTree,
  matchesDashboardFiltersForCrossMember,
  type BuildTreeOptions,
  type RawDataRow,
  type TreeNode,
} from '@/lib/dataManager';
import { buildCrossInitiativeOverviewTree } from '@/lib/crossInitiativeOverviewTree';
import {
  initiativeRowToRaw,
  membersForCross,
  type CrossInitiativeMemberRow,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import type { UnificationBudgetContext } from '@/lib/unificationBudget';

const MIN_LEAF_VALUE = 1;

/** Имя узла «Остальное» на дашборде кросс-инициатив. */
export const PORTFOLIO_REST_NODE_NAME = 'Остальное';

function sumChildValues(children: TreeNode[]): number {
  return children.reduce((s, c) => s + (c.value ?? 0), 0);
}

function crossHasUnit(cross: TreeNode, unitName: string): boolean {
  return (cross.children ?? []).some((u) => u.name === unitName);
}

function filterCrossesForUnit(crossNodes: TreeNode[], unitName: string): TreeNode[] {
  return crossNodes.filter((c) => c.isCrossInitiative && crossHasUnit(c, unitName));
}

export function crossMemberInitiativeIds(bundle: CrossInitiativesBundle): Set<string> {
  return new Set(bundle.members.map((m) => m.initiative_id));
}

export function collectInitiativeIdsFromTree(root: TreeNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: TreeNode) => {
    if (node.adminInitiativeRowId) ids.add(node.adminInitiativeRowId);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return ids;
}

function memberMatchesDashboardFilters(
  m: CrossInitiativeMemberRow,
  initiativeById: Map<string, AdminDataRow>,
  buildOptions: BuildTreeOptions
): boolean {
  const row = initiativeById.get(m.initiative_id);
  if (row) {
    return matchesDashboardFiltersForCrossMember(initiativeRowToRaw(row), buildOptions);
  }
  const unit = m.unit || '—';
  const team = m.team || '';
  if (buildOptions.selectedUnits?.length && !buildOptions.selectedUnits.includes(unit)) return false;
  if (buildOptions.unitFilter && unit !== buildOptions.unitFilter) return false;
  if (buildOptions.selectedTeams?.length && !buildOptions.selectedTeams.includes(team)) return false;
  if (buildOptions.teamFilter && team !== buildOptions.teamFilter) return false;
  return true;
}

function filterMembersForDashboard(
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  buildOptions: BuildTreeOptions
): CrossInitiativeMemberRow[] {
  return members.filter((m) => memberMatchesDashboardFilters(m, initiativeById, buildOptions));
}

/** Убрать из дерева бюджета инициативы, уже входящие в кросс-инициативы. */
function pruneTreeExcludingCrossMembers(node: TreeNode, crossIds: Set<string>): TreeNode | null {
  if (node.isInitiative || node.adminInitiativeRowId) {
    const id = node.adminInitiativeRowId;
    if (id && crossIds.has(id)) return null;
    return node;
  }

  const children = (node.children ?? [])
    .map((child) => pruneTreeExcludingCrossMembers(child, crossIds))
    .filter((n): n is TreeNode => n != null);

  if (children.length === 0) return null;

  return {
    ...node,
    value: sumChildValues(children),
    children,
  };
}

/**
 * «Остальное»: инициативы портфеля, не входящие ни в одну кросс-инициативу
 * (юнит → команда → инициатива, как на вкладке «Бюджет», без полосатой подсветки юнитов).
 */
export function buildPortfolioRestTree(
  rawData: RawDataRow[],
  bundle: CrossInitiativesBundle,
  buildOptions: BuildTreeOptions
): TreeNode | null {
  const crossIds = crossMemberInitiativeIds(bundle);
  const budgetRoot = buildBudgetTree(rawData, buildOptionsForInitiativeFilterMatch(buildOptions));
  const unitNodes = (budgetRoot.children ?? [])
    .map((unit) => pruneTreeExcludingCrossMembers(unit, crossIds))
    .filter((u): u is TreeNode => u != null);

  if (unitNodes.length === 0) return null;

  const value = sumChildValues(unitNodes);

  return {
    name: PORTFOLIO_REST_NODE_NAME,
    isPortfolioRest: true,
    value: value || MIN_LEAF_VALUE,
    children: unitNodes,
  };
}

/** Для сопоставления с фильтрами дашборда — всегда с листьями-инициативами (не зависит от чекбоксов уровней тремапа). */
function buildOptionsForInitiativeFilterMatch(buildOptions: BuildTreeOptions): BuildTreeOptions {
  return {
    ...buildOptions,
    showTeams: true,
    showInitiatives: true,
  };
}

function buildFilteredCrossRoot(
  bundle: CrossInitiativesBundle,
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx: UnificationBudgetContext | undefined,
  buildOptions: BuildTreeOptions
): TreeNode {
  const members = filterMembersForDashboard(bundle.members, initiativeById, buildOptions);
  return buildCrossInitiativeOverviewTree(
    bundle.crossInitiatives,
    members,
    initiativeById,
    selectedQuarters,
    budgetCtx
  );
}

export type BuildDashboardCrossTreeParams = {
  rawData: RawDataRow[];
  bundle: CrossInitiativesBundle;
  initiativeById: Map<string, AdminDataRow>;
  buildOptions: BuildTreeOptions;
  budgetCtx?: UnificationBudgetContext;
  /** Показать «Остальное» — инициативы вне кроссов. */
  includePortfolioRest?: boolean;
  selectedUnitFilter?: string;
  showCrossesForSelectedUnit?: boolean;
};

/** Только кросс-инициативы (с учётом фильтров дашборда). */
export function buildDashboardCrossOnlyTree(
  bundle: CrossInitiativesBundle,
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx: UnificationBudgetContext | undefined,
  rawData: RawDataRow[],
  buildOptions: BuildTreeOptions
): TreeNode {
  return buildFilteredCrossRoot(bundle, initiativeById, selectedQuarters, budgetCtx, buildOptions);
}

export function buildDashboardCrossPortfolioTree({
  rawData,
  bundle,
  initiativeById,
  buildOptions,
  budgetCtx,
  includePortfolioRest = true,
  selectedUnitFilter,
  showCrossesForSelectedUnit = true,
}: BuildDashboardCrossTreeParams): TreeNode {
  const crossRoot = buildFilteredCrossRoot(
    bundle,
    initiativeById,
    buildOptions.selectedQuarters,
    budgetCtx,
    buildOptions
  );
  const crossChildren = crossRoot.children ?? [];

  if (!includePortfolioRest) {
    return crossRoot;
  }

  let restNode = buildPortfolioRestTree(rawData, bundle, buildOptions);

  if (selectedUnitFilter && restNode?.children?.length) {
    const units = restNode.children.filter((u) => u.name === selectedUnitFilter);
    restNode =
      units.length > 0
        ? {
            ...restNode,
            children: units,
            value: sumChildValues(units),
          }
        : null;
  }

  let children: TreeNode[];

  if (selectedUnitFilter) {
    const crosses =
      showCrossesForSelectedUnit !== false
        ? filterCrossesForUnit(crossChildren, selectedUnitFilter)
        : [];
    children = [...crosses, ...(restNode ? [restNode] : [])];
  } else {
    children = [...crossChildren, ...(restNode ? [restNode] : [])];
  }

  if (children.length === 0) {
    return { name: 'Портфель', isRoot: true, value: MIN_LEAF_VALUE, children: [] };
  }

  const total = sumChildValues(children);

  return {
    name: 'Портфель',
    isRoot: true,
    value: total || MIN_LEAF_VALUE,
    children,
  };
}

export function crossesForUnit(
  bundle: CrossInitiativesBundle,
  unitName: string
): string[] {
  const names = new Set<string>();
  for (const cross of bundle.crossInitiatives) {
    const members = membersForCross(cross.id, bundle.members);
    if (members.some((m) => m.unit === unitName)) {
      names.add(cross.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'));
}
