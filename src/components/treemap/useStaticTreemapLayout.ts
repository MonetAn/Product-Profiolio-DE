// Раскладка «Статичный вью» — отдельно от динамического D3-тримапа.

import { useMemo } from 'react';
import type { TreeNode } from '@/lib/dataManager';
import { getUnitColor } from '@/lib/dataManager';
import type { ColorGetter, ContainerDimensions, TreemapLayoutNode } from './types';
import { layoutSemanticUnits } from '@/lib/treemapSemanticLayout';
import { findTreeNodeByPath, layoutD3SubtreeInRect } from '@/lib/treemapD3Layout';
import { encodeTreemapPathSegment } from '@/lib/treemapPathCodec';

/** Отступ снизу при зуме (как визуальный зазор в динамическом вью) */
const ZOOM_LAYOUT_BOTTOM_PAD = 12;

interface UseStaticTreemapLayoutOptions {
  data: TreeNode;
  dimensions: ContainerDimensions;
  getColor?: ColorGetter;
  extraDepth?: number;
  focusedPath?: string[];
  maxRenderDepth?: number;
}

export function useStaticTreemapLayout({
  data,
  dimensions,
  getColor = getUnitColor,
  extraDepth = 0,
  focusedPath = [],
  maxRenderDepth,
}: UseStaticTreemapLayoutOptions): TreemapLayoutNode[] {
  return useMemo(() => {
    if (!data.children || data.children.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return [];
    }

    const renderDepth = maxRenderDepth ?? 3 + extraDepth;
    const units = data.children.filter((c) => (c.value || 0) > 0);

    let layoutNodes = layoutSemanticUnits(
      units,
      dimensions.width,
      dimensions.height,
      getColor,
      renderDepth
    );

    if (focusedPath.length > 0) {
      let validPath = [...focusedPath];
      let focusedTree: TreeNode | null = null;
      while (validPath.length > 0 && !focusedTree) {
        focusedTree = findTreeNodeByPath(data, validPath);
        if (!focusedTree) validPath = validPath.slice(0, -1);
      }
      if (focusedTree) {
        const layoutHeight = Math.max(0, dimensions.height - ZOOM_LAYOUT_BOTTOM_PAD);
        const colorAnchor = validPath[0];
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
  }, [data, dimensions.width, dimensions.height, getColor, extraDepth, focusedPath, maxRenderDepth]);
}
