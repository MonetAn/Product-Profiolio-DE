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
  // Timeline stub (placeholder initiative)
  isTimelineStub?: boolean;
  /** For unit-only view: aggregated distributed budget */
  distributedValue?: number;
  /** For unit-only view: aggregated unallocated budget */
  unallocatedValue?: number;
}

// Animation type determines duration and behavior
export type AnimationType = 'filter' | 'drilldown' | 'navigate-up' | 'resize' | 'initial';

// Easing curve for treemap layout transitions (ease-in-out: soft start and end to avoid "jump" on zoom and other transitions)
export const TREEMAP_EASE = [0.65, 0, 0.35, 1] as const;

// Animation durations in ms — zoom-in aligned with zoom-out
// initial: no animation (first paint, tab switch). drilldown: zoom-in. navigate-up: zoom-out. filter: toggles (teams/initiatives). resize: container size change.
export const ANIMATION_DURATIONS: Record<AnimationType, number> = {
  'initial': 0,
  'filter': 380,
  'drilldown': 800,
  'navigate-up': 800,
  'resize': 420
};

// Shorter duration when many nodes are visible to reduce reflow frames (same animation, less time in heavy phase)
const VISIBLE_NODES_THRESHOLD = 50;
const DURATION_WHEN_MANY_FILTER_MS = 280;
const DURATION_WHEN_MANY_RESIZE_MS = 300;

export function getEffectiveDuration(animationType: AnimationType, visibleNodeCount?: number): number {
  const base = ANIMATION_DURATIONS[animationType];
  if (visibleNodeCount == null || visibleNodeCount <= VISIBLE_NODES_THRESHOLD) return base;
  if (animationType === 'filter') return DURATION_WHEN_MANY_FILTER_MS;
  if (animationType === 'resize') return DURATION_WHEN_MANY_RESIZE_MS;
  return base;
}

// Text visibility during layout transitions: hide at start, show near end so text is not read while moving
/** Share of layout duration after which to show text (0–1). e.g. 0.9 = show at 90% of transition */
export const TEXT_VISIBLE_AT_RATIO = 0.9;
/** Duration in ms for the opacity transition of the text wrapper (fade-out and fade-in) */
export const TEXT_OPACITY_TRANSITION_MS = 150;

// Container dimensions
export interface ContainerDimensions {
  width: number;
  height: number;
}

// Color getter function type
export type ColorGetter = (name: string) => string;
