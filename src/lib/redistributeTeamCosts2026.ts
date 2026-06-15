import { supabase } from '@/integrations/supabase/client';
import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import {
  createEmptyQuarterData,
  isAllocationRoundingDustRub,
  isQuarterPeriodKey,
} from '@/lib/adminDataManager';
import { columnEffortSum, teamQuarterCostSum } from '@/lib/adminEffortTreemapPreviewModel';
import { quarterlyDataToJson, quarterlyJsonToAdminRecord } from '@/hooks/useInitiatives';
import type { Json } from '@/integrations/supabase/types';
import {
  type TeamBaselineRow,
  teamBaselineKey,
} from '@/lib/budgetTruth2026';
import { compareQuarters } from '@/lib/quarterUtils';

const Y2026_QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function effortInQuarter(row: AdminDataRow, quarter: string): number {
  const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
  return Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
}

function baselineTq(baseline: TeamBaselineRow, quarter: string): number {
  switch (quarter) {
    case '2026-Q1':
      return baseline.q1;
    case '2026-Q2':
      return baseline.q2;
    case '2026-Q3':
      return baseline.q3;
    case '2026-Q4':
      return baseline.q4;
    default:
      return 0;
  }
}

export type BuildTeamCostsOptions = {
  /** LIST1 эталон команды — приоритетный источник Tq. */
  baseline?: TeamBaselineRow | null;
  /** Снимок суммы команды «до» (например, до удаления в preview). */
  fixedTqByQuarter?: ReadonlyMap<string, number>;
};

/**
 * Пересчёт cost по % усилия: Tq из baseline (или fixed / факт), не-заглушки = round(eff/100·Tq),
 * заглушка = остаток. Сохраняет тотал команды за квартал.
 */
export function buildQuarterlyCostsForTeam(
  teamRows: AdminDataRow[],
  previewQuarters: string[],
  options?: BuildTeamCostsOptions
): Map<string, Record<string, AdminQuarterData>> {
  const out = new Map<string, Record<string, AdminQuarterData>>();
  for (const r of teamRows) {
    out.set(r.id, structuredClone(r.quarterlyData));
  }

  const sortedQ = [...previewQuarters].filter((q) => Y2026_QUARTERS.includes(q as (typeof Y2026_QUARTERS)[number])).sort(
    compareQuarters
  );
  if (sortedQ.length === 0) return out;

  const stubIds = teamRows.filter((r) => r.isTimelineStub).map((r) => r.id);

  const resolveTq = (q: string): number => {
    const fixed = options?.fixedTqByQuarter?.get(q);
    if (fixed !== undefined && fixed > 0) return fixed;
    if (options?.baseline) {
      const bt = baselineTq(options.baseline, q);
      if (bt > 0) return bt;
    }
    return teamQuarterCostSum(teamRows, q);
  };

  for (const q of sortedQ) {
    const Tq = resolveTq(q);
    if (Tq <= 0) {
      for (const r of teamRows) {
        const full = out.get(r.id)!;
        const cur = full[q] ?? createEmptyQuarterData();
        full[q] = { ...cur, cost: 0, costFinanceConfirmed: true };
      }
      continue;
    }

    if (columnEffortSum(teamRows, q) > 100 + 1e-4) continue;

    let nonStubCostOtherSum = 0;
    for (const r of teamRows) {
      if (r.isTimelineStub) continue;
      const eff = effortInQuarter(r, q);
      const share = Math.max(0, Math.round((eff / 100) * Tq));
      const cur = out.get(r.id)![q] ?? createEmptyQuarterData();
      const other = Number(cur.otherCosts) || 0;
      const cost = Math.max(0, share - other);
      out.get(r.id)![q] = { ...cur, cost, costFinanceConfirmed: true };
      nonStubCostOtherSum += cost + other;
    }

    const stubResidual = Math.max(0, Tq - nonStubCostOtherSum);
    if (stubIds.length > 0) {
      const stubId = stubIds[0];
      const cur = out.get(stubId)![q] ?? createEmptyQuarterData();
      const other = Number(cur.otherCosts) || 0;
      const stubCost = Math.max(0, stubResidual - other);
      out.get(stubId)![q] = {
        ...cur,
        cost: isAllocationRoundingDustRub(stubCost) ? 0 : stubCost,
        effortCoefficient: 0,
        costFinanceConfirmed: true,
      };
      for (let i = 1; i < stubIds.length; i++) {
        const extra = out.get(stubIds[i])![q] ?? createEmptyQuarterData();
        out.get(stubIds[i])![q] = { ...extra, cost: 0, effortCoefficient: 0, costFinanceConfirmed: true };
      }
    }
  }

  return out;
}

/** Снимок Tq по кварталам до удаления (сумма cost+other по всем строкам команды). */
export function frozenTeamQuarterTotals(
  teamRows: AdminDataRow[],
  quarters: string[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const q of quarters) {
    m.set(q, teamQuarterCostSum(teamRows, q));
  }
  return m;
}

async function fetchTeamBaseline(unit: string, team: string): Promise<TeamBaselineRow | null> {
  const { data, error } = await sb
    .from('team_budget_baseline_2026')
    .select('unit, team, q1, q2, q3, q4, rub_all, rub_pnl_it')
    .eq('unit', unit)
    .eq('team', team)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    unit: data.unit,
    team: data.team,
    q1: Number(data.q1) || 0,
    q2: Number(data.q2) || 0,
    q3: Number(data.q3) || 0,
    q4: Number(data.q4) || 0,
    rubAll: Number(data.rub_all) || 0,
    rubPnlIt: Number(data.rub_pnl_it) || 0,
  };
}

async function fetchLiveTeamRows(unit: string, team: string): Promise<AdminDataRow[]> {
  const { data, error } = await supabase
    .from('initiatives')
    .select('id, unit, team, initiative, is_timeline_stub, quarterly_data')
    .eq('unit', unit)
    .eq('team', team)
    .is('deleted_at', null);
  if (error) throw error;

  return (data ?? []).map((raw) => ({
    id: raw.id,
    unit: raw.unit ?? unit,
    team: raw.team ?? team,
    initiative: raw.initiative ?? '',
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    isTimelineStub: Boolean(raw.is_timeline_stub),
    quarterlyData: quarterlyJsonToAdminRecord(raw.quarterly_data),
  }));
}

async function syncTeamSplitFromQuarterly(unit: string, team: string): Promise<void> {
  const { data: rows, error: listErr } = await supabase
    .from('initiatives')
    .select('id, is_timeline_stub, quarterly_data')
    .eq('unit', unit)
    .eq('team', team)
    .is('deleted_at', null);
  if (listErr) throw listErr;

  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  const { error: delErr } = await sb
    .from('initiative_budget_department_2026')
    .delete()
    .in('initiative_id', ids);
  if (delErr) throw delErr;

  const inserts: Array<Record<string, unknown>> = [];
  for (const raw of rows ?? []) {
    if (raw.is_timeline_stub) continue;
    const qd = quarterlyJsonToAdminRecord(raw.quarterly_data);
    const q1 = Math.round(qd['2026-Q1']?.cost ?? 0);
    const q2 = Math.round(qd['2026-Q2']?.cost ?? 0);
    const q3 = Math.round(qd['2026-Q3']?.cost ?? 0);
    const q4 = Math.round(qd['2026-Q4']?.cost ?? 0);
    if (q1 + q2 + q3 + q4 <= 0) continue;
    inserts.push({
      initiative_id: raw.id,
      budget_department: '(из quarterly, без CSV split)',
      q1,
      q2,
      q3,
      q4,
      is_in_pnl_it: true,
      updated_at: new Date().toISOString(),
    });
  }

  if (inserts.length > 0) {
    const { error: insErr } = await sb.from('initiative_budget_department_2026').insert(inserts);
    if (insErr) throw insErr;
  }
}

export type RedistributeTeamResult = {
  updatedRowIds: string[];
  usedBaseline: boolean;
};

/**
 * После удаления инициативы: пересчитать cost всей команды по baseline LIST1 и % усилия.
 * Тотал команды (и портфеля) не падает — доля удалённой уходит на оставшиеся строки / стаб.
 */
export async function redistributeTeamCosts2026InDb(
  unit: string,
  team: string
): Promise<RedistributeTeamResult> {
  const baseline = await fetchTeamBaseline(unit, team);
  const teamRows = await fetchLiveTeamRows(unit, team);
  if (teamRows.length === 0) {
    return { updatedRowIds: [], usedBaseline: Boolean(baseline) };
  }

  const dataById = buildQuarterlyCostsForTeam(teamRows, [...Y2026_QUARTERS], { baseline });
  const updatedRowIds: string[] = [];

  for (const row of teamRows) {
    const next = dataById.get(row.id);
    if (!next) continue;
    const { error } = await supabase
      .from('initiatives')
      .update({ quarterly_data: quarterlyDataToJson(next) as Json })
      .eq('id', row.id);
    if (error) throw error;
    updatedRowIds.push(row.id);
  }

  await syncTeamSplitFromQuarterly(unit, team);

  return { updatedRowIds, usedBaseline: Boolean(baseline) };
}

export function teamBaselineFromMap(
  unit: string,
  team: string,
  baselineByTeam: Map<string, TeamBaselineRow> | undefined
): TeamBaselineRow | null {
  return baselineByTeam?.get(teamBaselineKey(unit, team)) ?? null;
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Обнулить cost 2026 у удаляемой строки и её split (до soft-delete). */
export async function zeroInitiative2026BudgetInDb(initiativeId: string): Promise<void> {
  const { data: initRow, error: readErr } = await supabase
    .from('initiatives')
    .select('quarterly_data')
    .eq('id', initiativeId)
    .single();
  if (readErr) throw readErr;

  const qd = quarterlyJsonToAdminRecord(initRow?.quarterly_data);
  let changed = false;
  for (const key of Object.keys(qd)) {
    if (!isQuarterPeriodKey(key) || !/^2026-Q[1-4]$/i.test(key)) continue;
    const cur = qd[key] ?? createEmptyQuarterData();
    if (toNum(cur.cost) !== 0 || toNum(cur.otherCosts) !== 0) {
      qd[key] = { ...cur, cost: 0, otherCosts: 0 };
      changed = true;
    }
  }
  if (changed) {
    const { error } = await supabase
      .from('initiatives')
      .update({ quarterly_data: quarterlyDataToJson(qd) as Json })
      .eq('id', initiativeId);
    if (error) throw error;
  }

  const { error: delErr } = await sb
    .from('initiative_budget_department_2026')
    .delete()
    .eq('initiative_id', initiativeId);
  if (delErr) throw delErr;
}
