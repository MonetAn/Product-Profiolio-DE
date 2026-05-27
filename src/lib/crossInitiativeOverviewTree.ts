import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  contributionToCross,
  initiativeFullCost,
  initiativeRowToRaw,
  membersForCross,
  type CrossInitiativeMemberRow,
  type CrossInitiativeRow,
} from '@/lib/crossInitiativeModel';
import { getUnitColor, type TreeNode } from '@/lib/dataManager';
import {
  initiativeTreemapValue,
  type UnificationBudgetContext,
} from '@/lib/unificationBudget';

function memberUnitTeam(
  m: CrossInitiativeMemberRow,
  initiativeById: Map<string, AdminDataRow>
): { unit: string; team: string } {
  const row = initiativeById.get(m.initiative_id);
  return {
    unit: m.unit || row?.unit || '—',
    team: m.team || row?.team || '—',
  };
}

function initiativeLeaf(
  m: CrossInitiativeMemberRow,
  initiativeById: Map<string, AdminDataRow>,
  members: CrossInitiativeMemberRow[],
  selectedQuarters: string[],
  crossId: string,
  budgetCtx?: UnificationBudgetContext
): TreeNode | null {
  const row = initiativeById.get(m.initiative_id);
  const { unit, team } = memberUnitTeam(m, initiativeById);
  const name = row?.initiative ?? m.initiative_name ?? '—';
  const contribution = contributionToCross(
    m.initiative_id,
    crossId,
    members,
    initiativeById,
    selectedQuarters,
    budgetCtx
  );
  const fullCost = initiativeFullCost(row, selectedQuarters, budgetCtx);
  const treemapVal = initiativeTreemapValue(row, selectedQuarters, budgetCtx);
  const layoutBase = contribution > 0 ? contribution : treemapVal;
  const displayBudget = fullCost > 0 ? fullCost : layoutBase;
  const value = Math.max(layoutBase, 1);
  const raw = row ? initiativeRowToRaw(row) : undefined;
  return {
    name,
    value,
    displayBudget,
    isInitiative: true,
    adminInitiativeRowId: m.initiative_id,
    unit,
    team,
    unitStripeColor: getUnitColor(unit),
    description: row?.description,
    quarterlyData: raw?.quarterlyData,
  };
}

/** Обзор: корень → кросс-инициатива → юнит → команда → инициатива. */
export function buildCrossInitiativeOverviewTree(
  crosses: CrossInitiativeRow[],
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): TreeNode {
  const crossNodes: TreeNode[] = [];

  for (const cross of [...crosses].sort((a, b) => a.name.localeCompare(b.name))) {
    const crossMembers = membersForCross(cross.id, members);
    if (crossMembers.length === 0) continue;

    const byUnit = new Map<string, CrossInitiativeMemberRow[]>();
    for (const m of crossMembers) {
      const { unit } = memberUnitTeam(m, initiativeById);
      const list = byUnit.get(unit) ?? [];
      list.push(m);
      byUnit.set(unit, list);
    }

    const unitNodes: TreeNode[] = [];
    for (const [unit, unitMembers] of [...byUnit.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const byTeam = new Map<string, CrossInitiativeMemberRow[]>();
      for (const m of unitMembers) {
        const { team } = memberUnitTeam(m, initiativeById);
        const list = byTeam.get(team) ?? [];
        list.push(m);
        byTeam.set(team, list);
      }

      const teamNodes: TreeNode[] = [];
      for (const [team, teamMembers] of [...byTeam.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        const leaves = teamMembers
          .map((m) =>
            initiativeLeaf(m, initiativeById, crossMembers, selectedQuarters, cross.id, budgetCtx)
          )
          .filter((n): n is TreeNode => n != null);
        if (leaves.length === 0) continue;
        const teamValue = leaves.reduce((s, c) => s + (c.value ?? 0), 0);
        teamNodes.push({
          name: team,
          isTeam: true,
          team,
          unit,
          value: teamValue,
          children: leaves,
        });
      }

      if (teamNodes.length === 0) continue;
      const unitValue = teamNodes.reduce((s, c) => s + (c.value ?? 0), 0);
      unitNodes.push({
        name: unit,
        isUnit: true,
        unit,
        value: unitValue,
        children: teamNodes,
      });
    }

    if (unitNodes.length === 0) continue;

    const crossValue = unitNodes.reduce((s, c) => s + (c.value ?? 0), 0);
    crossNodes.push({
      name: cross.name,
      isUnit: true,
      isCrossInitiative: true,
      crossInitiativeId: cross.id,
      value: crossValue,
      children: unitNodes,
    });
  }

  const total = crossNodes.reduce((s, c) => s + (c.value ?? 0), 0);

  return {
    name: 'Кросс-инициативы',
    isRoot: true,
    value: total || 1,
    children: crossNodes,
  };
}

/** Компактное дерево одной кросс-инициативы (полоса результата в режиме «Связать»). */
export function buildSingleCrossOverviewTree(
  cross: CrossInitiativeRow,
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): TreeNode {
  return buildCrossInitiativeOverviewTree(
    [cross],
    members,
    initiativeById,
    selectedQuarters,
    budgetCtx
  );
}
