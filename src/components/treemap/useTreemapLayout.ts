// Hook for computing treemap layout using D3 (pure calculation, no DOM)

import { useMemo } from 'react';
import * as d3 from 'd3';
import { TreeNode, getUnitColor, adjustBrightness } from '@/lib/dataManager';
import { TreemapLayoutNode, ColorGetter, ContainerDimensions } from './types';

interface UseTreemapLayoutOptions {
  data: TreeNode;
  dimensions: ContainerDimensions;
  getColor?: ColorGetter;
  extraDepth?: number;
  focusedPath?: string[]; // e.g. ['UnitA'] or ['UnitA', 'Team1']
}

// Find a node in the D3 hierarchy by path of names
function findNodeByPath(
  root: d3.HierarchyRectangularNode<TreeNode>,
  path: string[]
): d3.HierarchyRectangularNode<TreeNode> | null {
  let current = root;
  for (const name of path) {
    const child = current.children?.find(c => c.data.name === name);
    if (!child) return null;
    current = child;
  }
  return current;
}

// Flatten D3 hierarchy into array of layout nodes
function flattenHierarchy(
  node: d3.HierarchyRectangularNode<TreeNode>,
  depth: number,
  getColor: ColorGetter,
  parentPath: string = '',
  maxDepth: number = 3
): TreemapLayoutNode[] {
  const result: TreemapLayoutNode[] = [];
  
  const path = parentPath ? `${parentPath}/${node.data.name}` : node.data.name;
  const key = `d${depth}-${path}`;
  
  // Get color based on top-level ancestor
  let colorName = node.data.name;
  let current: d3.HierarchyRectangularNode<TreeNode> | null = node;
  while (current.parent && current.parent.parent) {
    current = current.parent;
    colorName = current.data.name;
  }
  
  const baseColor = getColor(colorName);
  let color = baseColor;
  if (depth === 1) {
    color = adjustBrightness(baseColor, -15);
  } else if (depth === 2) {
    color = adjustBrightness(baseColor, -30);
  }
  
  const layoutNode: TreemapLayoutNode = {
    key,
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
  };
  
  // Process children if we haven't reached max depth
  if (node.children && depth < maxDepth) {
    layoutNode.children = [];
    for (const child of node.children) {
      const childNodes = flattenHierarchy(child, depth + 1, getColor, path, maxDepth);
      layoutNode.children.push(childNodes[0]); // First node is the direct child
    }
  }
  
  result.push(layoutNode);
  return result;
}

// Apply focus transform: scale all coordinates so that focusedNode fills the viewport
function applyFocusTransform(
  nodes: TreemapLayoutNode[],
  focusedNode: d3.HierarchyRectangularNode<TreeNode>,
  width: number,
  height: number
): TreemapLayoutNode[] {
  const fx0 = focusedNode.x0;
  const fy0 = focusedNode.y0;
  const fw = focusedNode.x1 - focusedNode.x0;
  const fh = focusedNode.y1 - focusedNode.y0;
  
  if (fw === 0 || fh === 0) return nodes;
  
  const scaleX = width / fw;
  const scaleY = height / fh;
  
  function transformNode(node: TreemapLayoutNode): TreemapLayoutNode {
    const newX0 = (node.x0 - fx0) * scaleX;
    const newY0 = (node.y0 - fy0) * scaleY;
    const newX1 = (node.x1 - fx0) * scaleX;
    const newY1 = (node.y1 - fy0) * scaleY;
    
    return {
      ...node,
      x0: newX0,
      y0: newY0,
      x1: newX1,
      y1: newY1,
      width: newX1 - newX0,
      height: newY1 - newY0,
      children: node.children?.map(transformNode),
    };
  }
  
  return nodes.map(transformNode);
}

export function useTreemapLayout({
  data,
  dimensions,
  getColor = getUnitColor,
  extraDepth = 0,
  focusedPath = [],
}: UseTreemapLayoutOptions): TreemapLayoutNode[] {
  return useMemo(() => {
    if (!data.children || data.children.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return [];
    }
    
    // Always compute full depth so all nodes have coordinates for zoom
    const renderDepth = 3 + extraDepth;
    
    // Create D3 hierarchy
    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Create treemap layout with dynamic padding based on depth
    const treemap = d3.treemap<TreeNode>()
      .size([dimensions.width, dimensions.height])
      .paddingOuter(2)
      .paddingTop(d => {
        if (renderDepth <= 1) return 2;
        // Stakeholder/Unit (depth 1): 20px header
        if (d.depth === 1) return 20;
        // Unit/Team (depth 2): 18px header
        if (d.depth === 2) return 18;
        // Team in Stakeholders (depth 3): 16px header
        if (d.depth === 3) return 16;
        return 2;
      })
      .paddingInner(2)
      .round(true);
    
    treemap(root);
    
    if (!root.children) return [];
    
    // Flatten to array of layout nodes
    let layoutNodes: TreemapLayoutNode[] = [];
    for (const child of root.children) {
      const nodes = flattenHierarchy(child, 0, getColor, '', renderDepth);
      layoutNodes.push(nodes[0]);
    }
    
    // Apply focus transform — try full path, then progressively shorter
    if (focusedPath.length > 0) {
      let focusedD3Node: d3.HierarchyRectangularNode<TreeNode> | null = null;
      let validPath = [...focusedPath];
      while (validPath.length > 0 && !focusedD3Node) {
        focusedD3Node = findNodeByPath(root, validPath);
        if (!focusedD3Node) validPath = validPath.slice(0, -1);
      }
      if (focusedD3Node) {
        layoutNodes = applyFocusTransform(layoutNodes, focusedD3Node, dimensions.width, dimensions.height);
      }
    }
    
    return layoutNodes;
  }, [data, dimensions.width, dimensions.height, getColor, extraDepth, focusedPath]);
}

// Calculate exit direction for a node (used in drilldown animation)
export function calculateExitDirection(
  node: TreemapLayoutNode,
  zoomTargetCenter: { x: number; y: number },
  containerDimensions: ContainerDimensions
): { x: number; y: number } {
  const nodeCenter = {
    x: node.x0 + node.width / 2,
    y: node.y0 + node.height / 2
  };
  
  const dx = nodeCenter.x - zoomTargetCenter.x;
  const dy = nodeCenter.y - zoomTargetCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const pushFactor = Math.max(containerDimensions.width, containerDimensions.height) * 1.5;
  
  return {
    x: node.x0 + (dx / distance) * pushFactor,
    y: node.y0 + (dy / distance) * pushFactor
  };
}

// Calculate enter direction for a node (used in navigate-up animation)
export function calculateEnterDirection(
  node: TreemapLayoutNode,
  containerCenter: { x: number; y: number },
  containerDimensions: ContainerDimensions
): { x: number; y: number } {
  const nodeCenter = {
    x: node.x0 + node.width / 2,
    y: node.y0 + node.height / 2
  };
  
  const dx = nodeCenter.x - containerCenter.x;
  const dy = nodeCenter.y - containerCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const pushFactor = Math.max(containerDimensions.width, containerDimensions.height) * 1.5;
  
  return {
    x: containerCenter.x + (dx / distance) * pushFactor,
    y: containerCenter.y + (dy / distance) * pushFactor
  };
}
