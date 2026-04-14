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

const COL_OVERFLOW_EPS = 1e-4;

/** Сумма % усилий по команде в одном квартале (колонка матрицы). */
export function columnEffortSum(rows: AdminDataRow[], quarter: string): number {
  return rows.reduce((s, row) => {
    const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
    return s + Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  }, 0);
}

/**
 * Доля квартального бюджета команды Tq для строки: eff% от столбца,
 * при сумме % > 100 в колонке — нормализация (как при записи в БД из quick flow).
 */
export function initiativeShareInQuarter(
  row: AdminDataRow,
  quarter: string,
  teamRows: AdminDataRow[]
): number {
  const Tq = teamQuarterCostSum(teamRows, quarter);
  const colSum = columnEffortSum(teamRows, quarter);
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  const eff = Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  if (colSum <= 1e-9) return 0;
  if (colSum > 100 + COL_OVERFLOW_EPS) {
    return (Tq * eff) / colSum;
  }
  return (Tq * eff) / 100;
}

/** Сумма долей по preview-кварталам (соответствует cost+other цели после пересчёта). */
export function initiativePeriodCostFromCoefficients(
  row: AdminDataRow,
  previewQuarters: string[],
  teamRows: AdminDataRow[]
): number {
  let s = 0;
  for (const q of previewQuarters) {
    s += initiativeShareInQuarter(row, q, teamRows);
  }
  return s;
}

/** Часть периода, не покрытая суммой % по кварталам (< 100% в колонке). */
export function unallocatedPeriodTotal(rows: AdminDataRow[], previewQuarters: string[]): number {
  let u = 0;
  for (const q of previewQuarters) {
    const Tq = teamQuarterCostSum(rows, q);
    const col = columnEffortSum(rows, q);
    if (col > 100 + COL_OVERFLOW_EPS) continue;
    u += Tq * (1 - col / 100);
  }
  return u;
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
 * Treemap превью и запись стоимостей в quick flow: доля в каждом квартале = Tq × (eff/100);
 * если в колонке сумма % > 100 — нормализация на сумму %. «Нераспределено» — слабые колонки (&lt; 100%).
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

  let maxColEffort = 0;
  for (const q of previewQuarters) {
    maxColEffort = Math.max(maxColEffort, columnEffortSum(rows, q));
  }
  const overflowPct = previewQuarters.some((q) => columnEffortSum(rows, q) > 100 + COL_OVERFLOW_EPS);

  const unalloc = unallocatedPeriodTotal(rows, previewQuarters);
  const zeroNames: string[] = [];
  const labelUsed = new Map<string, number>();
  const treeChildren: TreeNode[] = [];
  const stubNames = new Set<string>();
  const leaves: EffortTreemapLeaf[] = [];

  const pushLeaf = (name: string, rowId: string, value: number, effort: number, stub: boolean) => {
    if (value <= 1e-6) return;
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

  for (const row of rows) {
    const periodValue = initiativePeriodCostFromCoefficients(row, previewQuarters, rows);
    const meanEff = meanEffortCoefficient(row, previewQuarters);
    const base = row.initiative?.trim() || '—';
    if (periodValue > 1e-6) {
      pushLeaf(
        uniqueInitiativeLabel(base, labelUsed),
        row.id,
        periodValue,
        meanEff,
        Boolean(row.isTimelineStub)
      );
    } else if (meanEff <= 1e-6) {
      zeroNames.push(base);
    }
  }

  if (unalloc > 1e-2) {
    treeChildren.push({
      name: 'Нераспределено',
      value: unalloc,
      isInitiative: true,
    });
  }

  const contentKey = [
    previewQuarters.join(','),
    Math.round(effectiveTotal * 100),
    maxColEffort.toFixed(3),
    overflowPct ? 'ov1' : 'ov0',
    treeChildren.map((c) => `${c.name}:${Math.round(c.value ?? 0)}`).join('|'),
  ].join('::');

  const note = overflowPct
    ? 'В одном или нескольких кварталах сумма % больше 100% — доли в этих колонках нормализованы; Tq по кварталам из текущих данных.'
    : null;

  const getPreviewColor = (name: string) => {
    if (name === 'Нераспределено') return UNALLOCATED_COLOR;
    const base = getUnitColor(name);
    if (stubNames.has(name)) return mixHexWithNeutralGray(base, 0.48);
    return base;
  };

  return {
    effectiveTotal,
    sumEffort: maxColEffort,
    overflowPct,
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
