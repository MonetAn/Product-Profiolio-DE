// Treemap component types

import { TreeNode, QuarterData } from '@/lib/dataManager';

// Layout node with computed position from D3
export interface TreemapLayoutNode {
  // Unique identifier for React keys and Framer Motion layoutId
  key: string;
  // Path from root (e.g., "Root/UnitA/Team1/Initiative")
  path: string;
  // Display name
  name: string;
  // Original TreeNode data
  data: TreeNode;
  // Computed position and size from D3
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
  // Tree depth (0 = top-level)
  depth: number;
  // Computed budget value
  value: number;
  // Background color
  color: string;
  // Children nodes (if any)
  children?: TreemapLayoutNode[];
  // Parent reference for context
  parentName?: string;
  // Flags
  isUnit?: boolean;
  isTeam?: boolean;
  isInitiative?: boolean;
  isStakeholder?: boolean;
  offTrack?: boolean;
  support?: boolean;
  // Quarterly data for tooltips
  quarterlyData?: Record<string, QuarterData>;
  // Stakeholders list
  stakeholders?: string[];
  // Description
  description?: string;
}

// Animation type determines duration and behavior
export type AnimationType = 'filter' | 'drilldown' | 'drilldown-fast' | 'navigate-up' | 'navigate-up-fast' | 'resize' | 'initial';

// Animation durations in ms — zoom-in aligned with zoom-out, can be longer when needed
export const ANIMATION_DURATIONS: Record<AnimationType, number> = {
  'initial': 0,
  'filter': 750,
  'drilldown': 700,
  'drilldown-fast': 380,
  'navigate-up': 700,
  'navigate-up-fast': 380,
  'resize': 420
};

// Shorter duration when many nodes are visible to reduce reflow frames (same animation, less time in heavy phase)
const VISIBLE_NODES_THRESHOLD = 50;
const DURATION_WHEN_MANY_FILTER_MS = 450;
const DURATION_WHEN_MANY_RESIZE_MS = 280;

export function getEffectiveDuration(animationType: AnimationType, visibleNodeCount?: number): number {
  const base = ANIMATION_DURATIONS[animationType];
  if (visibleNodeCount == null || visibleNodeCount <= VISIBLE_NODES_THRESHOLD) return base;
  if (animationType === 'filter') return DURATION_WHEN_MANY_FILTER_MS;
  if (animationType === 'resize') return DURATION_WHEN_MANY_RESIZE_MS;
  return base;
}

// При zoom-in показывать текст под конец анимации (на этой доле длительности), а не после (на этой доле длительности), а не после
export const DRILLDOWN_TEXT_VISIBLE_AT_RATIO = 0.88;

// Content fade: movement threshold (px) above which text fades out/in during layout animation
export const CONTENT_FADE_MOVEMENT_THRESHOLD_PX = 24;
// Share of animation duration for fade-out (start) and fade-in (end)
export const CONTENT_FADE_OUT_RATIO = 0.08;
export const CONTENT_FADE_IN_RATIO = 0.08;
// New nodes: text stays hidden until movement is done, then fades in in the last 5%
export const CONTENT_FADE_NEW_IN_START = 0.95;

// Container dimensions
export interface ContainerDimensions {
  width: number;
  height: number;
}

// Color getter function type
export type ColorGetter = (name: string) => string;
