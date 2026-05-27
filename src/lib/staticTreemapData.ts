// Подготовка дерева только для StaticTreemapContainer — buildBudgetTree / dataManager не меняем.

import type { TreeNode } from '@/lib/dataManager';

function sumChildValues(children: TreeNode[]): number {
  return children.reduce((s, c) => s + (c.value || 0), 0);
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

  // Только юниты (без команд/инициатив) — value уже на узле
  if (rawChildren.length === 0) {
    const unitValue = unit.value || 0;
    if (unitValue <= 0) return null;
    return { ...unit, isUnit: true, value: unitValue, children: [] };
  }

  // Юнит → инициативы (без команд)
  if (rawChildren[0]?.isInitiative) {
    const initiatives = normalizeInitiativeLeaves(rawChildren);
    const unitValue = sumChildValues(initiatives) || unit.value || 0;
    if (unitValue <= 0) return null;
    return { ...unit, isUnit: true, value: unitValue, children: initiatives };
  }

  // Юнит → команды [→ инициативы]
  const teams = rawChildren
    .map(normalizeTeamNode)
    .filter((t): t is TreeNode => t != null);

  const unitValue = sumChildValues(teams) || unit.value || 0;
  if (unitValue <= 0) return null;

  return { ...unit, isUnit: true, value: unitValue, children: teams };
}

/** Кросс-инициатива → юниты → команды → инициативы (не путать с юнитом портфеля). */
function normalizeCrossInitiativeNode(cross: TreeNode): TreeNode | null {
  const rawChildren = cross.children ?? [];

  // Корневой уровень: плитка кросса без раскрытых уровней (все чекбоксы выкл.)
  if (rawChildren.length === 0) {
    const crossValue = cross.value || 0;
    if (crossValue <= 0) return null;
    return {
      ...cross,
      isUnit: true,
      isCrossInitiative: cross.isCrossInitiative,
      crossInitiativeId: cross.crossInitiativeId,
      value: crossValue,
      children: [],
    };
  }

  const unitNodes = rawChildren
    .map(normalizeUnitNode)
    .filter((u): u is TreeNode => u != null);

  if (unitNodes.length === 0) return null;

  const crossValue = sumChildValues(unitNodes) || cross.value || 0;
  if (crossValue <= 0) return null;

  return {
    ...cross,
    isUnit: true,
    isCrossInitiative: cross.isCrossInitiative,
    crossInitiativeId: cross.crossInitiativeId,
    value: crossValue,
    children: unitNodes,
  };
}

function normalizePortfolioRestNode(rest: TreeNode): TreeNode | null {
  const units = (rest.children ?? [])
    .map(normalizeUnitNode)
    .filter((u): u is TreeNode => u != null);
  if (units.length === 0) return null;
  const value = sumChildValues(units) || rest.value || 0;
  if (value <= 0) return null;
  return {
    ...rest,
    isPortfolioRest: true,
    value,
    children: units,
  };
}

function normalizeRootChild(child: TreeNode): TreeNode | null {
  if (child.isCrossInitiative) return normalizeCrossInitiativeNode(child);
  if (child.isPortfolioRest) return normalizePortfolioRestNode(child);
  return normalizeUnitNode(child);
}

/** Дерево для статичного тримапа: явные value на юнитах/командах, дети с бюджетом > 0. */
export function prepareStaticTreemapTree(root: TreeNode): TreeNode {
  if (!root.children?.length) return root;

  const children = root.children
    .map(normalizeRootChild)
    .filter((node): node is TreeNode => node != null);

  return { ...root, children };
}
