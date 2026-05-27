import type { AdminDataRow } from '@/lib/adminDataManager';
import { initiativeRowToRaw } from '@/lib/crossInitiativeModel';
import { getUnitColor, type TreeNode } from '@/lib/dataManager';
import {
  initiativeTreemapValue,
  type UnificationBudgetContext,
} from '@/lib/unificationBudget';

/** Плоское дерево инициатив для статичного тримапа на экране «Объединение». */
export function buildUnificationTreemapRoot(
  rootLabel: string,
  rows: AdminDataRow[],
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): TreeNode {
  const children: TreeNode[] = rows.map((row) => {
    const raw = initiativeRowToRaw(row);
    const value = initiativeTreemapValue(row, selectedQuarters, budgetCtx);
    return {
      name: row.initiative,
      value,
      isInitiative: true,
      adminInitiativeRowId: row.id,
      description: row.description,
      unit: row.unit,
      team: row.team,
      unitStripeColor: getUnitColor(row.unit),
      quarterlyData: raw.quarterlyData,
    };
  });

  const total = children.reduce((s, c) => s + (c.value ?? 0), 0);

  return {
    name: rootLabel || ' ',
    isRoot: true,
    value: total || 1,
    children,
  };
}

export type { UnificationBudgetContext };
