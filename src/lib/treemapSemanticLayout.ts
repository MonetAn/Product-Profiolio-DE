// Семантическая раскладка юнитов для слайдов: B2C → B2B → Drinkit сверху, платформа снизу.

import type { TreeNode } from '@/lib/dataManager';
import { encodeTreemapPathSegment } from '@/lib/treemapPathCodec';
import { layoutD3SubtreeInRect } from '@/lib/treemapD3Layout';
import type { ColorGetter, TreemapLayoutNode } from '@/components/treemap/types';

const GUTTER = 2;

/** Порядок в верхнем ряду (B2C / B2B / Drinkit) */
export const SEMANTIC_COMMERCIAL_ORDER = ['App&Web', 'B2C Pizza', 'B2B Pizza', 'Drinkit'] as const;

/** Порядок в нижнем ряду (платформа) */
export const SEMANTIC_PLATFORM_ORDER = [
  'FAP',
  'Client Platform',
  'Data Office',
  'Tech Platform',
  'Design',
] as const;

function normalizeUnitKey(name: string): string {
  return name.trim().toLowerCase();
}

function matchesOrderSlot(unitName: string, slot: string): boolean {
  const u = normalizeUnitKey(unitName);
  const s = normalizeUnitKey(slot);
  if (u === s) return true;
  if (s === 'app&web' && u.includes('app') && u.includes('web')) return true;
  if (s === 'b2c pizza' && u.includes('b2c')) return true;
  if (s === 'b2b pizza' && u.includes('b2b')) return true;
  if (s === 'drinkit' && u.includes('drinkit')) return true;
  return false;
}

function isCommercialUnit(name: string): boolean {
  return SEMANTIC_COMMERCIAL_ORDER.some((slot) => matchesOrderSlot(name, slot));
}

function commercialSortIndex(name: string): number {
  const idx = SEMANTIC_COMMERCIAL_ORDER.findIndex((slot) => matchesOrderSlot(name, slot));
  return idx >= 0 ? idx : SEMANTIC_COMMERCIAL_ORDER.length;
}

function platformSortIndex(name: string): number {
  const idx = SEMANTIC_PLATFORM_ORDER.findIndex((slot) => matchesOrderSlot(name, slot));
  return idx >= 0 ? idx : SEMANTIC_PLATFORM_ORDER.length;
}

function sortUnitsForBand(units: TreeNode[], band: 'commercial' | 'platform'): TreeNode[] {
  const sorter =
    band === 'commercial'
      ? (a: TreeNode, b: TreeNode) => {
          const ai = commercialSortIndex(a.name);
          const bi = commercialSortIndex(b.name);
          if (ai !== bi) return ai - bi;
          return (b.value || 0) - (a.value || 0);
        }
      : (a: TreeNode, b: TreeNode) => {
          const ai = platformSortIndex(a.name);
          const bi = platformSortIndex(b.name);
          if (ai !== bi) return ai - bi;
          return (b.value || 0) - (a.value || 0);
        };
  return [...units].sort(sorter);
}

function splitRow(
  items: TreeNode[],
  x0: number,
  y0: number,
  width: number,
  height: number
): Array<{ node: TreeNode; x0: number; y0: number; x1: number; y1: number }> {
  if (items.length === 0) return [];
  const total = items.reduce((s, n) => s + (n.value || 0), 0);
  const innerW = Math.max(0, width - GUTTER * (items.length + 1));
  const innerH = Math.max(0, height - GUTTER * 2);
  const rects: Array<{ node: TreeNode; x0: number; y0: number; x1: number; y1: number }> = [];
  let x = x0 + GUTTER;
  const y = y0 + GUTTER;
  items.forEach((node, i) => {
    const share = total > 0 ? (node.value || 0) / total : 1 / items.length;
    const w = i === items.length - 1 ? x0 + width - GUTTER - x : innerW * share;
    rects.push({ node, x0: x, y0: y, x1: x + w, y1: y + innerH });
    x += w + GUTTER;
  });
  return rects;
}

function buildUnitLeafNode(
  node: TreeNode,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  getColor: ColorGetter
): TreemapLayoutNode {
  const enc = encodeTreemapPathSegment(node.name);
  const baseColor = getColor(node.name);
  return {
    key: `d0-${enc}`,
    path: enc,
    name: node.name,
    data: node,
    x0,
    y0,
    x1,
    y1,
    width: x1 - x0,
    height: y1 - y0,
    depth: 0,
    value: node.value || 0,
    color: baseColor,
    isUnit: node.isUnit,
    isTeam: node.isTeam,
    isInitiative: node.isInitiative,
    distributedValue: node.distributedValue,
    unallocatedValue: node.unallocatedValue,
  };
}

export function layoutSemanticUnits(
  units: TreeNode[],
  width: number,
  height: number,
  getColor: ColorGetter,
  maxDepth: number
): TreemapLayoutNode[] {
  const commercial = sortUnitsForBand(
    units.filter((u) => isCommercialUnit(u.name)),
    'commercial'
  );
  const platform = sortUnitsForBand(
    units.filter((u) => !isCommercialUnit(u.name)),
    'platform'
  );

  const commercialTotal = commercial.reduce((s, u) => s + (u.value || 0), 0);
  const platformTotal = platform.reduce((s, u) => s + (u.value || 0), 0);
  const grandTotal = commercialTotal + platformTotal;

  let commercialH = 0;
  let platformH = 0;
  if (commercial.length > 0 && platform.length > 0) {
    commercialH = grandTotal > 0 ? (height * commercialTotal) / grandTotal : height / 2;
    platformH = height - commercialH - GUTTER;
  } else if (commercial.length > 0) {
    commercialH = height;
  } else {
    platformH = height;
  }

  const rects: Array<{ node: TreeNode; x0: number; y0: number; x1: number; y1: number }> = [];

  if (commercial.length > 0 && commercialH > 0) {
    rects.push(...splitRow(commercial, 0, 0, width, commercialH));
  }
  if (platform.length > 0 && platformH > 0) {
    const y0 = commercial.length > 0 ? commercialH + GUTTER : 0;
    rects.push(...splitRow(platform, 0, y0, width, platformH));
  }

  return rects.map(({ node, x0, y0, x1, y1 }) => {
    const hasNested = (node.children?.length ?? 0) > 0 && maxDepth > 1;
    if (!hasNested) {
      return buildUnitLeafNode(node, x0, y0, x1, y1, getColor);
    }
    return layoutD3SubtreeInRect(node, x0, y0, x1, y1, getColor, maxDepth, node.name);
  });
}

