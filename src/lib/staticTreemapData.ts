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

/** Дерево для статичного тримапа: явные value на юнитах/командах, дети с бюджетом > 0. */
export function prepareStaticTreemapTree(root: TreeNode): TreeNode {
  if (!root.children?.length) return root;

  const children = root.children
    .map(normalizeUnitNode)
    .filter((unit): unit is TreeNode => unit != null);

  return { ...root, children };
}
