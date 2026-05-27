import type { TreeNode } from '@/lib/dataManager';
import { findTreeNodeByPath } from '@/lib/treemapD3Layout';

export type CrossOverviewVisibility = {
  showUnits: boolean;
  showTeams: boolean;
  showInitiatives: boolean;
};

/** Согласованные уровни: инициативы можно смотреть внутри юнитов без команд. */
export function coerceCrossOverviewVisibility(
  vis: CrossOverviewVisibility
): CrossOverviewVisibility {
  const { showUnits, showTeams, showInitiatives } = vis;
  if (!showInitiatives) return vis;

  if (showUnits && !showTeams) {
    return { showUnits: true, showTeams: false, showInitiatives: true };
  }
  if (!showUnits && !showTeams) {
    return { showUnits: false, showTeams: false, showInitiatives: true };
  }
  if (showTeams) {
    return {
      showUnits: showUnits || showTeams,
      showTeams: true,
      showInitiatives: true,
    };
  }
  return vis;
}

function sumValues(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + (n.value ?? 0), 0);
}

function mergeTeamNodes(a: TreeNode, b: TreeNode): TreeNode {
  const mergedChildren = [...(a.children ?? []), ...(b.children ?? [])];
  return {
    ...a,
    value: (a.value ?? 0) + (b.value ?? 0),
    children: mergedChildren.length > 0 ? mergedChildren : undefined,
  };
}

/** Все команды кросса (схлопнуть одноимённые из разных юнитов). */
function flattenTeamsFromCross(cross: TreeNode, withInitiatives: boolean): TreeNode[] {
  const byName = new Map<string, TreeNode>();
  for (const unit of cross.children ?? []) {
    for (const team of unit.children ?? []) {
      const key = team.name;
      const teamCopy: TreeNode = {
        ...team,
        children: withInitiatives ? [...(team.children ?? [])] : undefined,
      };
      const prev = byName.get(key);
      byName.set(key, prev ? mergeTeamNodes(prev, teamCopy) : teamCopy);
    }
  }
  return [...byName.values()].filter((t) => (t.value ?? 0) > 0);
}

/** Все инициативы кросса плоским списком. */
function flattenInitiativesFromCross(cross: TreeNode): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const unit of cross.children ?? []) {
    for (const team of unit.children ?? []) {
      for (const leaf of team.children ?? []) {
        const id = leaf.adminInitiativeRowId ?? leaf.name;
        if (!byId.has(id)) byId.set(id, leaf);
      }
    }
  }
  return [...byId.values()].filter((n) => (n.value ?? 0) > 0);
}

function projectCrossChildren(cross: TreeNode, vis: CrossOverviewVisibility): TreeNode[] | undefined {
  const { showUnits, showTeams, showInitiatives } = vis;
  if (!showUnits && !showTeams && !showInitiatives) return undefined;

  if (showUnits && !showTeams && !showInitiatives) {
    return (cross.children ?? []).map((u) => ({ ...u, children: undefined }));
  }
  if (!showUnits && showTeams && !showInitiatives) {
    return flattenTeamsFromCross(cross, false);
  }
  if (!showUnits && !showTeams && showInitiatives) {
    return flattenInitiativesFromCross(cross);
  }
  if (showUnits && showTeams && !showInitiatives) {
    return (cross.children ?? []).map((u) => ({
      ...u,
      children: (u.children ?? []).map((t) => ({ ...t, children: undefined })),
    }));
  }
  if (showUnits && !showTeams && showInitiatives) {
    return (cross.children ?? []).map((u) => {
      const leaves: TreeNode[] = [];
      for (const team of u.children ?? []) {
        leaves.push(...(team.children ?? []));
      }
      return { ...u, value: sumValues(leaves) || u.value, children: leaves };
    });
  }
  if (!showUnits && showTeams && showInitiatives) {
    return flattenTeamsFromCross(cross, true);
  }
  if (showUnits && showTeams && showInitiatives) {
    return cross.children;
  }
  return cross.children;
}

function flattenInitiativesFromUnit(unit: TreeNode): TreeNode[] {
  const kids = unit.children ?? [];
  if (kids.length > 0 && kids.every((c) => c.isInitiative)) {
    return kids.filter((n) => (n.value ?? 0) > 0);
  }
  const leaves: TreeNode[] = [];
  for (const team of kids) {
    leaves.push(...(team.children ?? []));
  }
  return leaves.filter((n) => (n.value ?? 0) > 0);
}

function projectUnitChildren(unit: TreeNode, vis: CrossOverviewVisibility): TreeNode[] | undefined {
  const { showTeams, showInitiatives } = vis;
  if (!showTeams && !showInitiatives) return undefined;

  if (showTeams && !showInitiatives) {
    return (unit.children ?? []).map((t) => ({ ...t, children: undefined }));
  }
  if (!showTeams && showInitiatives) {
    return flattenInitiativesFromUnit(unit);
  }
  return unit.children;
}

function projectTeamChildren(team: TreeNode, vis: CrossOverviewVisibility): TreeNode[] | undefined {
  if (!vis.showInitiatives) return undefined;
  return team.children;
}

function reshapeCross(cross: TreeNode, vis: CrossOverviewVisibility): TreeNode {
  const projected = projectCrossChildren(cross, vis);
  if (!projected) {
    return { ...cross, children: undefined };
  }

  const children = projected.map((child) => {
    if (child.isInitiative) return child;
    if (child.isTeam) return reshapeTeam(child, vis);
    if (child.isUnit && !child.isCrossInitiative) {
      const directInitiatives =
        child.children?.length &&
        child.children.every((c) => c.isInitiative) &&
        !vis.showTeams;
      if (directInitiatives) return child;
      return reshapeUnit(child, vis);
    }
    return child;
  });

  return {
    ...cross,
    value: sumValues(children) || cross.value,
    children,
  };
}

function reshapeUnit(unit: TreeNode, vis: CrossOverviewVisibility): TreeNode {
  const projected = projectUnitChildren(unit, vis);
  if (!projected) {
    return { ...unit, children: undefined };
  }
  const children = projected.map((child) =>
    child.isTeam ? reshapeTeam(child, vis) : child
  );
  return {
    ...unit,
    value: sumValues(children) || unit.value,
    children,
  };
}

function reshapeTeam(team: TreeNode, vis: CrossOverviewVisibility): TreeNode {
  const projected = projectTeamChildren(team, vis);
  return {
    ...team,
    value: projected ? sumValues(projected) || team.value : team.value,
    children: projected,
  };
}

/** Применить видимость уровней к полному дереву обзора. */
export function applyCrossOverviewView(
  root: TreeNode,
  visibility: CrossOverviewVisibility
): TreeNode {
  if (!root.children?.length) return root;

  const vis = coerceCrossOverviewVisibility(visibility);

  const children = root.children.map((child) => {
    if (child.isCrossInitiative) return reshapeCross(child, vis);
    if (child.isPortfolioRest) return reshapePortfolioRest(child, vis);
    return child;
  });

  return {
    ...root,
    value: sumValues(children) || root.value,
    children,
  };
}

function reshapePortfolioRest(rest: TreeNode, vis: CrossOverviewVisibility): TreeNode {
  const units = (rest.children ?? []).map((unit) => reshapeUnit(unit, vis));
  const withChildren = units.filter((u) => (u.children?.length ?? 0) > 0 || (u.value ?? 0) > 0);
  if (withChildren.length === 0) {
    return { ...rest, children: undefined, value: rest.value };
  }
  return {
    ...rest,
    value: sumValues(withChildren) || rest.value,
    children: withChildren,
  };
}

/** Высота поддерева (число видимых уровней вниз от узла). */
function measureSubtreeLevels(node: TreeNode): number {
  if (!node.children?.length) return 0;
  return 1 + Math.max(...node.children.map(measureSubtreeLevels));
}

/**
 * Глубина layout для D3: считаем от текущего фокуса по уже перестроенному дереву.
 * Нужен запас +2: layout вкладывает внуков только если maxDepth > childDepth + 1.
 */
export function crossOverviewRenderDepth(
  viewRoot: TreeNode,
  focusedPath: string[] = []
): number {
  const focusNode =
    focusedPath.length > 0 ? findTreeNodeByPath(viewRoot, focusedPath) : viewRoot;
  const base = focusNode ?? viewRoot;
  const levels = measureSubtreeLevels(base);
  return Math.max(3, levels + 2);
}
