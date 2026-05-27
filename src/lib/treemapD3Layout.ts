// D3-раскладка поддерева для статичного тримапа (не используется динамическим TreemapContainer).

import * as d3 from 'd3';
import type { TreeNode } from '@/lib/dataManager';
import { adjustBrightness, mixHexWithNeutralGray } from '@/lib/dataManager';
import { encodeTreemapPathSegment } from '@/lib/treemapPathCodec';
import type { ColorGetter, TreemapLayoutNode } from '@/components/treemap/types';

/** Ключ цвета для узла (юнит, кросс, «Остальное» с одним юнитом). */
export function treemapColorAnchorForNode(node: TreeNode, fallback: string): string {
  if (node.isCrossInitiative) return node.name;
  if (node.isPortfolioRest) {
    const units = (node.children ?? []).filter((c) => c.isUnit && !c.isCrossInitiative);
    if (units.length === 1) return units[0].name;
    return node.name;
  }
  if (node.isUnit && !node.isCrossInitiative) return node.name;
  if (node.unit) return node.unit;
  return fallback;
}

function resolveTreemapColorKey(
  node: TreeNode,
  depth: number,
  topLevelName: string,
  unitColorKey?: string
): string {
  if (node.isCrossInitiative) return node.name;
  if (node.isPortfolioRest) {
    const units = (node.children ?? []).filter((c) => c.isUnit && !c.isCrossInitiative);
    if (units.length === 1) return units[0].name;
    return node.name;
  }
  if (node.isPortfolioUnit) return node.name;
  if (node.isUnit && !node.isCrossInitiative) return node.name;
  if (node.unit) return node.unit;
  if (unitColorKey) return unitColorKey;
  if (node.isTeam || node.isInitiative) return topLevelName;
  return topLevelName;
}

function flattenD3Hierarchy(
  node: d3.HierarchyRectangularNode<TreeNode>,
  depth: number,
  getColor: ColorGetter,
  parentPath: string,
  maxDepth: number,
  topLevelName: string,
  unitColorKey?: string
): TreemapLayoutNode {
  const enc = encodeTreemapPathSegment(node.data.name);
  const path = parentPath ? `${parentPath}/${enc}` : enc;

  const colorKey = resolveTreemapColorKey(node.data, depth, topLevelName, unitColorKey);
  const baseColor = getColor(colorKey);
  let color = baseColor;
  if (depth === 1) color = adjustBrightness(baseColor, -15);
  else if (depth === 2) color = adjustBrightness(baseColor, -30);

  if (node.data.isInitiative && node.data.support) {
    color = mixHexWithNeutralGray(color, 0.46);
  }

  const layoutNode: TreemapLayoutNode = {
    key: `d${depth}-${path}`,
    path,
    name: node.data.name,
    data: node.data,
    x0: node.x0,
    y0: node.y0,
    x1: node.x1,
    y1: node.y1,
    width: node.x1 - node.x0,
    height: node.y1 - node.y0,
    depth,
    value: node.value || 0,
    color,
    parentName: node.parent?.data.name,
    isUnit: node.data.isUnit,
    isTeam: node.data.isTeam,
    isInitiative: node.data.isInitiative,
    isStakeholder: node.data.isStakeholder,
    offTrack: node.data.offTrack,
    support: node.data.support,
    quarterlyData: node.data.quarterlyData,
    stakeholders: node.data.stakeholders,
    description: node.data.description,
    isTimelineStub: node.data.isTimelineStub,
    distributedValue: node.data.distributedValue,
    unallocatedValue: node.data.unallocatedValue,
    crossAllocatedValue: node.data.crossAllocatedValue,
    hasPreliminaryQuarterInPeriod: node.data.hasPreliminaryQuarterInPeriod,
  };

  const childUnitKey =
    node.data.isUnit && !node.data.isCrossInitiative ? node.data.name : unitColorKey;

  if (node.children && depth < maxDepth) {
    layoutNode.children = node.children.map((child) =>
      flattenD3Hierarchy(child, depth + 1, getColor, path, maxDepth, topLevelName, childUnitKey)
    );
  }

  return layoutNode;
}

function offsetLayoutTree(node: TreemapLayoutNode, dx: number, dy: number): TreemapLayoutNode {
  return {
    ...node,
    x0: node.x0 + dx,
    y0: node.y0 + dy,
    x1: node.x1 + dx,
    y1: node.y1 + dy,
    children: node.children?.map((c) => offsetLayoutTree(c, dx, dy)),
  };
}

function headerPxForNode(node: TreeNode): number {
  if (node.isUnit || node.isStakeholder) return 20;
  if (node.isTeam) return 12;
  return 0;
}

function buildNodeShell(
  rootNode: TreeNode,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  getColor: ColorGetter,
  colorAnchor: string,
  depth: number
): TreemapLayoutNode {
  const enc = encodeTreemapPathSegment(rootNode.name);
  const baseColor = getColor(colorAnchor);
  return {
    key: `d${depth}-${enc}`,
    path: enc,
    name: rootNode.name,
    data: rootNode,
    x0,
    y0,
    x1,
    y1,
    width: x1 - x0,
    height: y1 - y0,
    depth,
    value: rootNode.value || 0,
    color: baseColor,
    isUnit: rootNode.isUnit,
    isTeam: rootNode.isTeam,
    isInitiative: rootNode.isInitiative,
    isStakeholder: rootNode.isStakeholder,
    distributedValue: rootNode.distributedValue,
    unallocatedValue: rootNode.unallocatedValue,
    crossAllocatedValue: rootNode.crossAllocatedValue,
    unitStripeColor: rootNode.unitStripeColor,
  };
}

/** Раскладка только прямых детей в прямоугольник (без вложенных grandchildren в одном d3.treemap). */
function layoutDirectChildrenInRect(
  parentNode: TreeNode,
  parentPath: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  getColor: ColorGetter,
  colorAnchor: string,
  childDepth: number,
  maxDepth: number,
  unitColorKey?: string
): TreemapLayoutNode[] {
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const rawChildren = parentNode.children?.filter((c) => (c.value || 0) > 0) ?? [];
  if (rawChildren.length === 0 || width === 0 || height === 0) return [];

  const needNestedPass = maxDepth > childDepth + 1;
  const leavesForD3 = needNestedPass
    ? rawChildren.map((child) => {
        if ((child.children?.length ?? 0) > 0) {
          return { ...child, children: [] };
        }
        return child;
      })
    : rawChildren;

  const virtualRoot: TreeNode = { name: '__layout__', children: leavesForD3 };
  const hRoot = d3
    .hierarchy(virtualRoot)
    .sum((d) => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  d3
    .treemap<TreeNode>()
    .size([width, height])
    .paddingOuter(0)
    .paddingTop((d) => (d.depth === 0 ? 0 : 2))
    .paddingInner(2)
    .round(false)(hRoot);

  return (hRoot.children ?? []).map((d3Child) => {
    const source = rawChildren.find((c) => c.name === d3Child.data.name) ?? d3Child.data;
    const childUnitKey =
      source.isUnit && !source.isCrossInitiative ? source.name : unitColorKey;
    let laid = flattenD3Hierarchy(
      d3Child,
      childDepth,
      getColor,
      parentPath,
      maxDepth,
      colorAnchor,
      childUnitKey
    );
    laid = offsetLayoutTree(laid, x0, y0);

    const hasGrandchildren = (source.children?.length ?? 0) > 0 && maxDepth > childDepth + 1;
    if (!hasGrandchildren) return laid;

    const header = headerPxForNode(source);
    const nested = layoutD3SubtreeInRect(
      source,
      laid.x0,
      laid.y0 + header,
      laid.x1,
      laid.y1,
      getColor,
      maxDepth,
      treemapColorAnchorForNode(source, colorAnchor),
      childDepth,
      laid.path,
      childUnitKey
    );
    return { ...laid, children: nested.children };
  });
}

/**
 * D3 squarify для поддерева: дети заполняют прямоугольник; внуки — отдельным проходом внутри каждого ребёнка.
 */
export function layoutD3SubtreeInRect(
  rootNode: TreeNode,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  getColor: ColorGetter,
  maxDepth: number,
  colorAnchor?: string,
  depth = 0,
  nodePath?: string,
  unitColorKey?: string
): TreemapLayoutNode {
  const effectiveUnitKey =
    rootNode.isUnit && !rootNode.isCrossInitiative ? rootNode.name : unitColorKey;
  const anchor = colorAnchor ?? rootNode.name;
  const segment = encodeTreemapPathSegment(rootNode.name);
  const fullPath = nodePath ?? segment;
  const shell = buildNodeShell(rootNode, x0, y0, x1, y1, getColor, anchor, depth);

  if (maxDepth <= depth + 1 || !(rootNode.children?.length ?? 0)) {
    return { ...shell, path: fullPath };
  }

  const header = headerPxForNode(rootNode);
  const innerY0 = y0 + header;
  const children = layoutDirectChildrenInRect(
    rootNode,
    fullPath,
    x0,
    innerY0,
    x1,
    y1,
    getColor,
    anchor,
    depth + 1,
    maxDepth,
    effectiveUnitKey
  );

  return { ...shell, path: fullPath, children };
}

export function findTreeNodeByPath(root: TreeNode, path: string[]): TreeNode | null {
  let node: TreeNode | undefined = root;
  for (const name of path) {
    if (!node) return null;
    const child = node.children?.find((c) => c.name === name);
    if (!child) return null;
    node = child;
  }
  return node ?? null;
}
