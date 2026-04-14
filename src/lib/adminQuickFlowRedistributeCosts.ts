import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import { createEmptyQuarterData } from '@/lib/adminDataManager';
import { columnEffortSum, teamPeriodCostSum, teamQuarterCostSum } from '@/lib/adminEffortTreemapPreviewModel';
import { compareQuarters } from '@/lib/quarterUtils';

const COL_OVERFLOW_EPS = 1e-4;

function allocateIntegerCosts(
  ids: string[],
  costFloatById: Map<string, number>,
  targetSum: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const target = Math.max(0, Math.round(targetSum));
  const entries = ids.map((id) => {
    const f = Math.max(0, costFloatById.get(id) ?? 0);
    const fl = Math.floor(f);
    return { id, base: fl, rem: f - fl };
  });
  let sumBase = entries.reduce((s, e) => s + e.base, 0);
  let delta = target - sumBase;
  const orderUp = [...entries].sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < delta; k++) {
    orderUp[k % orderUp.length].base += 1;
  }
  sumBase = entries.reduce((s, e) => s + e.base, 0);
  delta = target - sumBase;
  const orderDown = [...entries].sort((a, b) => a.base - b.base || a.rem - b.rem);
  for (let k = 0; k < -delta; k++) {
    const e = orderDown[k % orderDown.length];
    if (e.base > 0) e.base -= 1;
  }
  for (const e of entries) out.set(e.id, Math.max(0, e.base));
  return out;
}

function effortInQuarter(row: AdminDataRow, quarter: string): number {
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  return Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
}

/**
 * Целочисленные cost по колонке: только строки с effort &gt; 0 получают долю; 0% → cost 0.
 */
function allocateColumnCostsInteger(
  teamRows: AdminDataRow[],
  quarter: string,
  targetCostSum: number,
  costHints: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of teamRows) {
    out.set(r.id, 0);
  }
  const target = Math.max(0, Math.round(targetCostSum));
  const activeIds = teamRows.filter((r) => effortInQuarter(r, quarter) > 1e-9).map((r) => r.id);
  if (target === 0 || activeIds.length === 0) {
    return out;
  }

  let sumH = 0;
  for (const id of activeIds) {
    sumH += Math.max(0, costHints.get(id) ?? 0);
  }

  const scaled = new Map<string, number>();
  if (sumH < 1e-9) {
    const base = Math.floor(target / activeIds.length);
    let rem = target - base * activeIds.length;
    for (const id of activeIds) {
      let v = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      out.set(id, v);
    }
    return out;
  }

  for (const id of activeIds) {
    scaled.set(id, ((costHints.get(id) ?? 0) * target) / sumH);
  }

  const allocated = allocateIntegerCosts(activeIds, scaled, target);
  for (const id of activeIds) {
    out.set(id, allocated.get(id) ?? 0);
  }
  return out;
}

/**
 * Полные quarterly_data по строкам команды: стоимости по кварталам как на превью treemap
 * (доля в квартале q = Tq × eff/100; при сумме % &gt; 100 в колонке — нормализация).
 * costFinanceConfirmed = false на кварталах сценария.
 */
export function buildQuarterlyDataFromPreview(
  teamRows: AdminDataRow[],
  previewQuarters: string[]
): Map<string, Record<string, AdminQuarterData>> {
  const out = new Map<string, Record<string, AdminQuarterData>>();
  for (const r of teamRows) {
    out.set(r.id, structuredClone(r.quarterlyData));
  }

  const sortedQ = [...previewQuarters].filter(Boolean).sort(compareQuarters);
  if (sortedQ.length === 0) return out;

  const T_period = teamPeriodCostSum(teamRows, sortedQ);

  if (T_period <= 1e-9) {
    for (const r of teamRows) {
      const full = out.get(r.id)!;
      for (const q of sortedQ) {
        const cur = full[q] ?? createEmptyQuarterData();
        full[q] = { ...cur, cost: 0, costFinanceConfirmed: false };
      }
    }
    return out;
  }

  for (const q of sortedQ) {
    const Tq = teamQuarterCostSum(teamRows, q);
    const colSum = columnEffortSum(teamRows, q);
    const otherSum = teamRows.reduce(
      (s, r) => s + (Number(r.quarterlyData[q]?.otherCosts) || 0),
      0
    );
    const allocatedFraction = colSum > 100 + COL_OVERFLOW_EPS ? 1 : colSum / 100;
    const targetCostSum = Math.max(0, Math.round(Tq * allocatedFraction - otherSum));

    const costHints = new Map<string, number>();
    for (const r of teamRows) {
      const qd = r.quarterlyData[q] ?? createEmptyQuarterData();
      const eff = effortInQuarter(r, q);
      const gross =
        colSum > 100 + COL_OVERFLOW_EPS
          ? colSum > 1e-9
            ? (Tq * eff) / colSum
            : 0
          : (Tq * eff) / 100;
      const o = Number(qd.otherCosts) || 0;
      costHints.set(r.id, Math.max(0, gross - o));
    }

    const newCosts = allocateColumnCostsInteger(teamRows, q, targetCostSum, costHints);

    for (const r of teamRows) {
      const full = out.get(r.id)!;
      const cur = full[q] ?? createEmptyQuarterData();
      full[q] = {
        ...cur,
        cost: newCosts.get(r.id) ?? 0,
        costFinanceConfirmed: false,
      };
    }
  }

  return out;
}
