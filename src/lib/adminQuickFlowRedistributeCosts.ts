import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import { createEmptyQuarterData } from '@/lib/adminDataManager';
import { columnEffortSum, teamPeriodCostSum, teamQuarterCostSum } from '@/lib/adminEffortTreemapPreviewModel';
import { compareQuarters } from '@/lib/quarterUtils';

function effortInQuarter(row: AdminDataRow, quarter: string): number {
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  return Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
}

/**
 * Целочисленная раскладка остатка между несколькими заглушками:
 * пропорционально текущей cost (или поровну, если у всех 0).
 */
function distributeResidualToStubs(
  stubIds: string[],
  hintsById: Map<string, number>,
  residual: number
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of stubIds) out.set(id, 0);
  const target = Math.max(0, Math.round(residual));
  if (target === 0 || stubIds.length === 0) return out;

  if (stubIds.length === 1) {
    out.set(stubIds[0], target);
    return out;
  }

  let sumH = 0;
  for (const id of stubIds) sumH += Math.max(0, hintsById.get(id) ?? 0);

  if (sumH <= 1e-9) {
    const base = Math.floor(target / stubIds.length);
    let rem = target - base * stubIds.length;
    for (const id of stubIds) {
      out.set(id, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
    }
    return out;
  }

  const entries = stubIds.map((id) => {
    const f = ((hintsById.get(id) ?? 0) * target) / sumH;
    const fl = Math.floor(f);
    return { id, base: fl, rem: f - fl };
  });
  let sumBase = entries.reduce((s, e) => s + e.base, 0);
  let delta = target - sumBase;
  const orderUp = [...entries].sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < delta; k++) orderUp[k % orderUp.length].base += 1;
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

/**
 * quarterly_data по строкам команды для записи в БД.
 *
 * Не-заглушка: cost = round((eff/100) · Tq) минус её otherCosts (cost+other = доля строки в бюджете команды).
 * Заглушка: cost = round(Tq − Σ(не-заглушки cost+other) − otherCosts заглушки) — реальный остаток.
 * При нескольких заглушках остаток делится между ними пропорционально текущей cost (или поровну при 0).
 *
 * Никаких равных делёжек: пустые коэффициенты у обычных = 0 у обычных, остаток остаётся на заглушке.
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

  const stubIds = teamRows.filter((r) => r.isTimelineStub).map((r) => r.id);

  for (const q of sortedQ) {
    const Tq = teamQuarterCostSum(teamRows, q);
    if (Tq <= 0) {
      for (const r of teamRows) {
        const full = out.get(r.id)!;
        const cur = full[q] ?? createEmptyQuarterData();
        full[q] = { ...cur, cost: 0, costFinanceConfirmed: false };
      }
      continue;
    }

    const colSum = columnEffortSum(teamRows, q);
    if (colSum > 100 + 1e-4) {
      // Σeff > 100% — данные невалидные, валидация отдельно. Не пишем мусор: оставляем cost как есть.
      continue;
    }

    let nonStubCostOtherSum = 0;
    for (const r of teamRows) {
      if (r.isTimelineStub) continue;
      const eff = effortInQuarter(r, q);
      const share = Math.max(0, Math.round((eff / 100) * Tq));
      const cur = out.get(r.id)![q] ?? createEmptyQuarterData();
      const other = Number(cur.otherCosts) || 0;
      const cost = Math.max(0, share - other);
      out.get(r.id)![q] = { ...cur, cost, costFinanceConfirmed: false };
      nonStubCostOtherSum += cost + other;
    }

    const stubResidual = Math.max(0, Tq - nonStubCostOtherSum);
    if (stubIds.length > 0) {
      const stubCostHintById = new Map<string, number>();
      let stubOtherSum = 0;
      for (const id of stubIds) {
        const cur = out.get(id)![q] ?? createEmptyQuarterData();
        stubOtherSum += Number(cur.otherCosts) || 0;
        stubCostHintById.set(id, Math.max(0, Number(cur.cost) || 0));
      }
      const stubCostTotal = Math.max(0, stubResidual - stubOtherSum);
      const perStub = distributeResidualToStubs(stubIds, stubCostHintById, stubCostTotal);
      for (const id of stubIds) {
        const cur = out.get(id)![q] ?? createEmptyQuarterData();
        out.get(id)![q] = {
          ...cur,
          cost: perStub.get(id) ?? 0,
          // Заглушка — контейнер остатка, её собственный effortCoefficient не имеет смысла.
          // Затираем при записи, чтобы убрать легаси-значения, которые могли висеть из старых импортов.
          effortCoefficient: 0,
          costFinanceConfirmed: false,
        };
      }
    }
    // Если заглушки нет — остаток "виснет" виртуально в treemap (см. unallocatedPeriodTotal),
    // в БД пишем только то, что приходится на реальные инициативы. Это корректно для команд
    // без явного остатка-контейнера; остаток не размазывается принудительно.
  }

  return out;
}
