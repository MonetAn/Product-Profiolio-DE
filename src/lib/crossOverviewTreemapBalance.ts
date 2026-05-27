import type { TreeNode } from '@/lib/dataManager';

/** Минимальная доля площади относительно крупнейшего соседа (чтобы все связи были видны). */
const MIN_SIBLING_RATIO = 0.14;

function sumChildValues(children: TreeNode[]): number {
  return children.reduce((s, c) => s + (c.value ?? 0), 0);
}

function balanceSiblings(nodes: TreeNode[]): TreeNode[] {
  if (nodes.length <= 1) return nodes;
  const maxVal = Math.max(...nodes.map((n) => n.value ?? 0), 1);
  const floor = maxVal * MIN_SIBLING_RATIO;
  return nodes.map((n) => ({
    ...n,
    value: Math.max(n.value ?? 0, floor),
  }));
}

/** Пропорционально масштабирует поддерево до targetValue (листья получают displayBudget). */
function propagateValueToDescendants(node: TreeNode, targetValue: number): TreeNode {
  if (!node.children?.length) {
    const displayBudget =
      node.isInitiative && (node.displayBudget ?? 0) <= 0 && targetValue > 0
        ? targetValue
        : node.displayBudget;
    return { ...node, value: targetValue, displayBudget };
  }

  const children = node.children;
  const naturalSum = sumChildValues(children);

  if (naturalSum <= 0) {
    const each = targetValue / children.length;
    return {
      ...node,
      value: targetValue,
      children: children.map((c) => propagateValueToDescendants(c, each)),
    };
  }

  const scale = targetValue / naturalSum;
  return {
    ...node,
    value: targetValue,
    children: children.map((c) =>
      propagateValueToDescendants(c, (c.value ?? 0) * scale)
    ),
  };
}

function alignChildSubtreesToNodeValue(node: TreeNode): TreeNode {
  const target = node.value ?? 0;
  if (!node.children?.length || target <= 0) return node;

  const innerSum = sumChildValues(node.children);
  if (innerSum >= target * 0.99) return node;

  return propagateValueToDescendants(node, target);
}

function rebalanceNode(node: TreeNode): TreeNode {
  if (!node.children?.length) return node;

  const balancedChildren = balanceSiblings(node.children.map(rebalanceNode));
  const children = balancedChildren.map(alignChildSubtreesToNodeValue);

  return {
    ...node,
    children,
    value: sumChildValues(children) || node.value,
  };
}

/** Выравнивает площади плиток внутри кросс-инициатив (все участники остаются видимыми). */
export function balanceCrossOverviewTreemapValues(root: TreeNode): TreeNode {
  if (!root.children?.length) return root;

  const crosses = root.children.map((cross) => {
    if (!cross.isCrossInitiative) return cross;
    return rebalanceNode(cross);
  });

  return {
    ...root,
    children: crosses,
    value: sumChildValues(crosses) || root.value,
  };
}
