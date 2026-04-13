import type { AdminDataRow } from '@/lib/adminDataManager';
import { createEmptyQuarterData } from '@/lib/adminDataManager';
import type { TreeNode } from '@/lib/dataManager';
import { getUnitColor, mixHexWithNeutralGray } from '@/lib/dataManager';

const UNALLOCATED_COLOR = '#94a3b8';

export function teamQuarterCostSum(rows: AdminDataRow[], quarter: string): number {
  return rows.reduce((s, row) => {
    const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
    return s + (qd.cost ?? 0) + (qd.otherCosts ?? 0);
  }, 0);
}

export function teamPeriodCostSum(rows: AdminDataRow[], quarters: string[]): number {
  if (quarters.length === 0) return 0;
  return rows.reduce((acc, row) => {
    let rowSum = 0;
    for (const q of quarters) {
      const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
      rowSum += (qd.cost ?? 0) + (qd.otherCosts ?? 0);
    }
    return acc + rowSum;
  }, 0);
}

export function meanEffortCoefficient(row: AdminDataRow, quarters: string[]): number {
  if (quarters.length === 0) return 0;
  let s = 0;
  for (const q of quarters) {
    const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
    s += Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  }
  return s / quarters.length;
}

function uniqueInitiativeLabel(base: string, used: Map<string, number>): string {
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base} (${n})`;
}

export type EffortTreemapLeaf = {
  label: string;
  rowId: string;
  effort: number;
  stub: boolean;
  value: number;
};

export type EffortTreemapPreviewModel = {
  effectiveTotal: number;
  sumEffort: number;
  overflowPct: boolean;
  leaves: EffortTreemapLeaf[];
  zeroEffortLabels: string[];
  treeChildren: TreeNode[];
  contentKey: string;
  getPreviewColor: (name: string) => string;
  note: string | null;
};

/**
 * Treemap листья по средним коэффициентам усилий за период (как в диалоге превью).
 * `effectiveTotal` — сумма (cost + otherCosts) команды за `previewQuarters`.
 */
export function buildEffortTreemapPreviewModel(
  rows: AdminDataRow[],
  previewQuarters: string[]
): EffortTreemapPreviewModel {
  const effectiveTotal = teamPeriodCostSum(rows, previewQuarters);

  if (previewQuarters.length === 0 || effectiveTotal <= 0) {
    return {
      effectiveTotal,
      sumEffort: 0,
      overflowPct: false,
      leaves: [],
      zeroEffortLabels: [],
      treeChildren: [],
      contentKey: 'empty',
      getPreviewColor: (name: string) =>
        name === 'Нераспределено' ? UNALLOCATED_COLOR : getUnitColor(name),
      note: null,
    };
  }

  let sumEffortAcc = 0;
  const withPct: { label: string; rowId: string; effort: number; stub: boolean }[] = [];
  const zeroNames: string[] = [];
  const labelUsed = new Map<string, number>();

  for (const row of rows) {
    const effort = meanEffortCoefficient(row, previewQuarters);
    const rounded = Math.round(effort * 1000) / 1000;
    const base = row.initiative?.trim() || '—';
    if (rounded > 1e-6) {
      sumEffortAcc += effort;
      withPct.push({
        label: uniqueInitiativeLabel(base, labelUsed),
        rowId: row.id,
        effort,
        stub: Boolean(row.isTimelineStub),
      });
    } else {
      zeroNames.push(base);
    }
  }

  const overflow = sumEffortAcc > 100 + 1e-4;
  const treeChildren: TreeNode[] = [];
  const stubNames = new Set<string>();
  const leaves: EffortTreemapLeaf[] = [];

  const pushLeaf = (name: string, rowId: string, value: number, effort: number, stub: boolean) => {
    if (value <= 0) return;
    if (stub) stubNames.add(name);
    treeChildren.push({
      name,
      value,
      isInitiative: true,
      isTimelineStub: stub,
      adminInitiativeRowId: rowId,
    });
    leaves.push({ label: name, rowId, effort, stub, value });
  };

  if (overflow) {
    for (const w of withPct) {
      const share = w.effort / sumEffortAcc;
      pushLeaf(w.label, w.rowId, effectiveTotal * share, w.effort, w.stub);
    }
  } else {
    for (const w of withPct) {
      pushLeaf(w.label, w.rowId, (effectiveTotal * w.effort) / 100, w.effort, w.stub);
    }
    const restPct = Math.max(0, 100 - sumEffortAcc);
    if (restPct > 1e-4) {
      treeChildren.push({
        name: 'Нераспределено',
        value: (effectiveTotal * restPct) / 100,
        isInitiative: true,
      });
    }
  }

  const contentKey = [
    previewQuarters.join(','),
    Math.round(effectiveTotal * 100),
    sumEffortAcc.toFixed(3),
    treeChildren.map((c) => `${c.name}:${Math.round(c.value ?? 0)}`).join('|'),
  ].join('::');

  const note = overflow
    ? 'Сумма средних коэффициентов больше 100% — площади пропорциональны долям, база не меняется.'
    : null;

  const getPreviewColor = (name: string) => {
    if (name === 'Нераспределено') return UNALLOCATED_COLOR;
    const base = getUnitColor(name);
    if (stubNames.has(name)) return mixHexWithNeutralGray(base, 0.48);
    return base;
  };

  return {
    effectiveTotal,
    sumEffort: sumEffortAcc,
    overflowPct: overflow,
    leaves,
    zeroEffortLabels: zeroNames,
    treeChildren,
    contentKey,
    getPreviewColor,
    note,
  };
}

const VALUE_EPS = 0.5;
const EFFORT_EPS = 0.05;

/** Помечает листья на «до» и «после», если изменились средний % усилий или площадь (стоимость) в treemap. */
export function applyEffortCompareToTreeChildren(
  beforeModel: EffortTreemapPreviewModel,
  afterModel: EffortTreemapPreviewModel
): { beforeChildren: TreeNode[]; afterChildren: TreeNode[] } {
  const beforeLeaf = new Map(beforeModel.leaves.map((l) => [l.rowId, l]));
  const afterLeaf = new Map(afterModel.leaves.map((l) => [l.rowId, l]));

  const decorate = (children: TreeNode[]): TreeNode[] =>
    children.map((node) => {
      const id = node.adminInitiativeRowId;
      if (!id || node.name === 'Нераспределено') return node;

      const b = beforeLeaf.get(id);
      const a = afterLeaf.get(id);
      if (!b || !a) return node;

      const changed =
        Math.abs(b.value - a.value) > VALUE_EPS || Math.abs(b.effort - a.effort) > EFFORT_EPS;
      if (!changed) return node;

      return {
        ...node,
        adminEffortChanged: true,
        adminEffortCompare: {
          effortBefore: b.effort,
          effortAfter: a.effort,
          valueBefore: b.value,
          valueAfter: a.value,
        },
      };
    });

  return {
    beforeChildren: decorate(beforeModel.treeChildren),
    afterChildren: decorate(afterModel.treeChildren),
  };
}
