import type { AdminDataRow } from '@/lib/adminDataManager';
import { createEmptyQuarterData, getStubResidualLabel } from '@/lib/adminDataManager';
import type { TreeNode } from '@/lib/dataManager';
import { getUnitColor, mixHexWithNeutralGray } from '@/lib/dataManager';
import { compareQuarters } from '@/lib/quarterUtils';

const UNALLOCATED_COLOR = '#94a3b8';

/**
 * Сколько % бюджета строка забирает у команды в этом квартале (для не-заглушек).
 * 100 → строка получит весь Tq; 0 → ничего. Не зависит от других строк, в отличие от
 * старой логики Tq*eff/colSum, которая «съедала» остаток у заглушки при любом 0 < Σeff < 100.
 */
function nonStubFractionForQuarter(row: AdminDataRow, quarter: string): number {
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  const eff = Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  return eff / 100;
}

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

const PREVIEW_COST_EPS = 1e-6;

/**
 * Кварталы для превью treemap в админке: сначала выбранный период матрицы (2025–26 и т.д.).
 * Если там сумма cost+other по команде = 0, а деньги есть в других кварталах выгрузки — берём их,
 * иначе превью остаётся пустым при живых данных в прошлых годах.
 */
export function resolveEffortPreviewQuarters(
  rows: AdminDataRow[],
  preferredFromMatrix: string[],
  fillQuarterCandidates: string[]
): string[] {
  if (preferredFromMatrix.length > 0 && teamPeriodCostSum(rows, preferredFromMatrix) > PREVIEW_COST_EPS) {
    return preferredFromMatrix;
  }
  const sortedFill = [...new Set(fillQuarterCandidates)].sort(compareQuarters);
  const withCost = sortedFill.filter((q) => teamPeriodCostSum(rows, [q]) > PREVIEW_COST_EPS);
  if (withCost.length > 0) return withCost;
  if (preferredFromMatrix.length > 0) return preferredFromMatrix;
  return sortedFill;
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

/** Сумма % усилий по не-заглушкам команды в одном квартале (колонка матрицы). */
export function columnEffortSum(rows: AdminDataRow[], quarter: string): number {
  return rows.reduce((s, row) => {
    if (row.isTimelineStub) return s;
    const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
    return s + Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  }, 0);
}

/** Заглушки команды в строках. Несколько — допустимо, остаток делим между ними пропорционально текущей cost. */
function stubRows(rows: AdminDataRow[]): AdminDataRow[] {
  return rows.filter((r) => r.isTimelineStub === true);
}

/**
 * Доля квартального бюджета команды Tq для строки.
 * Для обычных: (eff/100)·Tq. Для заглушки: остаток Tq − Σ(non-stub).
 * Несколько заглушек в команде делят остаток пропорционально их сохранённой cost (или поровну, если 0).
 * Никакого «равного фолбэка» — пустые коэффициенты у обычных = 0 у обычных, всё остаётся на заглушке.
 */
export function initiativeShareInQuarter(
  row: AdminDataRow,
  quarter: string,
  teamRows: AdminDataRow[]
): number {
  const Tq = teamQuarterCostSum(teamRows, quarter);
  if (Tq <= 0) return 0;

  if (!row.isTimelineStub) {
    return nonStubFractionForQuarter(row, quarter) * Tq;
  }

  // Заглушка: остаток Tq − Σ(доли обычных), не уходим в минус при Σeff > 100% (валидируется отдельно).
  const stubs = stubRows(teamRows);
  if (stubs.length === 0) return 0;
  let nonStubFrac = 0;
  for (const r of teamRows) {
    if (r.isTimelineStub) continue;
    nonStubFrac += nonStubFractionForQuarter(r, quarter);
  }
  const residualFrac = Math.max(0, 1 - nonStubFrac);
  const residual = residualFrac * Tq;
  if (residual <= 0) return 0;

  if (stubs.length === 1) return residual;

  let stubCostSum = 0;
  for (const s of stubs) {
    const qd = s.quarterlyData[quarter] ?? createEmptyQuarterData();
    stubCostSum += Math.max(0, (Number(qd.cost) || 0) + (Number(qd.otherCosts) || 0));
  }
  if (stubCostSum <= 1e-9) {
    return residual / stubs.length;
  }
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  const myStubCost = Math.max(0, (Number(qd.cost) || 0) + (Number(qd.otherCosts) || 0));
  return residual * (myStubCost / stubCostSum);
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

/**
 * Виртуальный остаток для команд **без заглушки**: Tq · (1 − Σnon-stub eff/100) суммарно по preview.
 * Если в команде есть хоть одна заглушка — она и держит остаток, и эта функция вернёт 0.
 */
export function unallocatedPeriodTotal(rows: AdminDataRow[], previewQuarters: string[]): number {
  if (stubRows(rows).length > 0) return 0;
  let total = 0;
  for (const q of previewQuarters) {
    const Tq = teamQuarterCostSum(rows, q);
    if (Tq <= 0) continue;
    let nonStubFrac = 0;
    for (const r of rows) {
      if (r.isTimelineStub) continue;
      nonStubFrac += nonStubFractionForQuarter(r, q);
    }
    total += Math.max(0, 1 - nonStubFrac) * Tq;
  }
  return total;
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
 * Treemap превью: для не-заглушек доля = (eff/100)·Tq, для заглушки — остаток Tq.
 * Если в команде заглушки нет, остаток уходит в виртуальный лист «Нераспределено · {team}».
 * `effectiveTotal` — сумма (cost + otherCosts) команды за `previewQuarters`.
 */
export function buildEffortTreemapPreviewModel(
  rows: AdminDataRow[],
  previewQuarters: string[]
): EffortTreemapPreviewModel {
  const effectiveTotal = teamPeriodCostSum(rows, previewQuarters);
  const teamForResidual = rows.find((r) => r.team)?.team ?? '';
  const virtualUnallocLabel = getStubResidualLabel(teamForResidual);
  const isUnallocLabel = (name: string) =>
    name === virtualUnallocLabel || name === 'Нераспределено' || name.startsWith('Нераспределено · ');

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
        isUnallocLabel(name) ? UNALLOCATED_COLOR : getUnitColor(name),
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
    const base = row.isTimelineStub
      ? getStubResidualLabel(row.team)
      : row.initiative?.trim() || '—';
    if (periodValue > 1e-6) {
      pushLeaf(
        uniqueInitiativeLabel(base, labelUsed),
        row.id,
        periodValue,
        meanEff,
        Boolean(row.isTimelineStub)
      );
    } else if (meanEff <= 1e-6 && !row.isTimelineStub) {
      zeroNames.push(base);
    }
  }

  if (unalloc > 1e-2) {
    treeChildren.push({
      name: virtualUnallocLabel,
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
    ? 'В одном или нескольких кварталах сумма % больше 100%. Перераспределите коэффициенты, чтобы остаток корректно лёг на заглушку.'
    : null;

  const getPreviewColor = (name: string) => {
    if (isUnallocLabel(name)) return UNALLOCATED_COLOR;
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
      const isUnalloc =
        node.name === 'Нераспределено' || node.name.startsWith('Нераспределено · ');
      if (!id || isUnalloc) return node;

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
