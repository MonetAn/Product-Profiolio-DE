// Раскладка «Статичный вью» — отдельно от динамического D3-тримапа.

import { useMemo } from 'react';
import type { TreeNode } from '@/lib/dataManager';
import { getUnitColor } from '@/lib/dataManager';
import type { ColorGetter, ContainerDimensions, TreemapLayoutNode } from './types';
import { layoutSemanticUnits } from '@/lib/treemapSemanticLayout';
import {
  findTreeNodeByPath,
  layoutD3SubtreeInRect,
  treemapColorAnchorForNode,
} from '@/lib/treemapD3Layout';
import { encodeTreemapPathSegment, normalizeTreemapFocusPath } from '@/lib/treemapPathCodec';

/** Отступ снизу при зуме (как визуальный зазор в динамическом вью) */
const ZOOM_LAYOUT_BOTTOM_PAD = 12;

export type StaticTreemapLayoutStrategy = 'semantic-units' | 'd3-root';

interface UseStaticTreemapLayoutOptions {
  data: TreeNode;
  dimensions: ContainerDimensions;
  getColor?: ColorGetter;
  extraDepth?: number;
  focusedPath?: string[];
  maxRenderDepth?: number;
  /** semantic-units — дашборд; d3-root — плоский список инициатив под корнем (Объединение). */
  layoutStrategy?: StaticTreemapLayoutStrategy;
}

export function useStaticTreemapLayout({
  data,
  dimensions,
  getColor = getUnitColor,
  extraDepth = 0,
  focusedPath = [],
  maxRenderDepth,
  layoutStrategy = 'semantic-units',
}: UseStaticTreemapLayoutOptions): TreemapLayoutNode[] {
  return useMemo(() => {
    if (!data.children || data.children.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return [];
    }

    const renderDepth = maxRenderDepth ?? 3 + extraDepth;
    const focusPath = normalizeTreemapFocusPath(data, focusedPath);

    if (layoutStrategy === 'd3-root') {
      if (focusPath.length > 0) {
        let validPath = [...focusPath];
        let focusedTree: TreeNode | null = null;
        while (validPath.length > 0 && !focusedTree) {
          focusedTree = findTreeNodeByPath(data, validPath);
          if (!focusedTree) validPath = validPath.slice(0, -1);
        }
        if (focusedTree) {
          const layoutHeight = Math.max(0, dimensions.height - ZOOM_LAYOUT_BOTTOM_PAD);
          const colorAnchor = treemapColorAnchorForNode(
            focusedTree,
            colorAnchorForNode(focusedTree, validPath[0])
          );
          const nodePath = validPath.map(encodeTreemapPathSegment).join('/');
          return [
            layoutD3SubtreeInRect(
              focusedTree,
              0,
              0,
              dimensions.width,
              layoutHeight,
              getColor,
              renderDepth,
              colorAnchor,
              0,
              nodePath
            ),
          ];
        }
      }
      return [
        layoutD3SubtreeInRect(
          data,
          0,
          0,
          dimensions.width,
          dimensions.height,
          getColor,
          renderDepth,
          treemapColorAnchorForNode(data, data.name),
          0,
          encodeTreemapPathSegment(data.name)
        ),
      ];
    }

    const units = data.children.filter((c) => (c.value || 0) > 0);

    let layoutNodes = layoutSemanticUnits(
      units,
      dimensions.width,
      dimensions.height,
      getColor,
      renderDepth
    );

    if (focusPath.length > 0) {
      let validPath = [...focusPath];
      let focusedTree: TreeNode | null = null;
      while (validPath.length > 0 && !focusedTree) {
        focusedTree = findTreeNodeByPath(data, validPath);
        if (!focusedTree) validPath = validPath.slice(0, -1);
      }
      if (focusedTree) {
        const layoutHeight = Math.max(0, dimensions.height - ZOOM_LAYOUT_BOTTOM_PAD);
        const colorAnchor = treemapColorAnchorForNode(
          focusedTree,
          colorAnchorForNode(focusedTree, validPath[0])
        );
        const nodePath = validPath.map(encodeTreemapPathSegment).join('/');
        return [
          layoutD3SubtreeInRect(
            focusedTree,
            0,
            0,
            dimensions.width,
            layoutHeight,
            getColor,
            renderDepth,
            colorAnchor,
            0,
            nodePath
          ),
        ];
      }
    }

    return layoutNodes;
  }, [
    data,
    dimensions.width,
    dimensions.height,
    getColor,
    extraDepth,
    focusedPath,
    maxRenderDepth,
    layoutStrategy,
  ]);
}

function colorAnchorForNode(node: TreeNode, pathHead: string): string {
  if (node.isCrossInitiative) return node.name;
  if (node.isPortfolioRest) {
    const units = (node.children ?? []).filter((c) => c.isUnit && !c.isCrossInitiative);
    if (units.length === 1) return units[0].name;
    return node.name;
  }
  if (node.isPortfolioUnit || (node.isUnit && !node.isCrossInitiative)) {
    return node.name;
  }
  return pathHead;
}
