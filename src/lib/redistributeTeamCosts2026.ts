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
import { findOrCreateTeamStub } from '@/lib/transferInitiativeBudgetToTeamStub';

const Y2026_QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

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
  /** LIST1 эталон — только явный reconcile/SQL; не для delete/Quick Flow. */
  baseline?: TeamBaselineRow | null;
  /** Снимок Tq команды «до» операции; главный якорь для админских действий. */
  fixedTqByQuarter?: ReadonlyMap<string, number>;
};

const EFFORT_CAP = 100;
const EFFORT_EPS = 1e-4;

/** Кварталы, где Σ% не-заглушек > 100 (сохранение должно блокироваться). */
export function teamEffortOverflowQuarters(
  teamRows: AdminDataRow[],
  quarters: string[]
): string[] {
  return quarters.filter((q) => columnEffortSum(teamRows, q) > EFFORT_CAP + EFFORT_EPS);
}

/**
 * Пересчёт cost по % усилия: Tq из frozen (или live), не-заглушки = round(eff/100·Tq),
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

  const anchored = Boolean(options?.baseline) || Boolean(options?.fixedTqByQuarter);

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

    const colEff = columnEffortSum(teamRows, q);
    if (colEff > EFFORT_CAP + EFFORT_EPS) {
      if (anchored) {
        throw new Error(
          `buildQuarterlyCostsForTeam: Σ% усилий ${colEff.toFixed(1)} > 100 в ${q} — сохранение заблокировано`
        );
      }
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
    } else if (anchored && stubResidual > 0 && !isAllocationRoundingDustRub(stubResidual)) {
      // Якорь есть, stub не передан в teamRows — остаток теряется; caller должен создать stub в БД.
      throw new Error(
        `buildQuarterlyCostsForTeam: нет заглушки команды, остаток ${stubResidual} ₽ в ${q}`
      );
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

/** Снимок Tq команды из БД (до удаления — вызывать до zero/soft-delete). */
export async function frozenTeamTotalsForTeam(
  unit: string,
  team: string
): Promise<Map<string, number>> {
  const rows = await fetchLiveTeamRows(unit, team);
  return frozenTeamQuarterTotals(rows, [...Y2026_QUARTERS]);
}

export type RedistributeTeamOptions = {
  /** Снимок Tq по кварталам до удаления (если baseline нет или q=0). */
  frozenTqByQuarter?: ReadonlyMap<string, number>;
};

async function teamYearCostLive(unit: string, team: string): Promise<number> {
  const { data, error } = await supabase
    .from('initiatives')
    .select('quarterly_data')
    .eq('unit', unit)
    .eq('team', team)
    .is('deleted_at', null);
  if (error) throw error;
  let sum = 0;
  for (const raw of data ?? []) {
    const qd = quarterlyJsonToAdminRecord(raw.quarterly_data);
    for (const q of Y2026_QUARTERS) {
      sum += toNum(qd[q]?.cost) + toNum(qd[q]?.otherCosts);
    }
  }
  return Math.round(sum);
}

function resolveTeamYearTarget(
  baseline: TeamBaselineRow | null,
  frozenTqByQuarter?: ReadonlyMap<string, number>
): number {
  if (frozenTqByQuarter) {
    let s = 0;
    for (const q of Y2026_QUARTERS) s += frozenTqByQuarter.get(q) ?? 0;
    if (s > 0) return Math.round(s);
  }
  if (baseline && baseline.rubAll > 0) return Math.round(baseline.rubAll);
  return 0;
}

/** Доводка до rub_all (или frozen year): пыль → Q4 стaba / крупнейшая инициатива. */
async function applyTeamYearDust(
  unit: string,
  team: string,
  targetYearRub: number
): Promise<void> {
  if (targetYearRub <= 0) return;
  const live = await teamYearCostLive(unit, team);
  const dust = Math.round(targetYearRub) - live;
  if (dust === 0) return;

  const stubId = await findOrCreateTeamStub(unit, team);
  const { data: initRow, error: readErr } = await supabase
    .from('initiatives')
    .select('quarterly_data')
    .eq('id', stubId)
    .single();
  if (readErr) throw readErr;

  const qd = quarterlyJsonToAdminRecord(initRow?.quarterly_data);
  const q4 = qd['2026-Q4'] ?? createEmptyQuarterData();
  qd['2026-Q4'] = {
    ...q4,
    cost: Math.max(0, toNum(q4.cost) + dust),
    effortCoefficient: 0,
    costFinanceConfirmed: true,
  };

  const { error } = await supabase
    .from('initiatives')
    .update({ quarterly_data: quarterlyDataToJson(qd) as Json })
    .eq('id', stubId);
  if (error) throw error;

  const liveAfter = await teamYearCostLive(unit, team);
  const dust2 = Math.round(targetYearRub) - liveAfter;
  if (dust2 === 0) return;

  const { data: rows, error: listErr } = await supabase
    .from('initiatives')
    .select('id, quarterly_data')
    .eq('unit', unit)
    .eq('team', team)
    .is('deleted_at', null)
    .eq('is_timeline_stub', false);
  if (listErr) throw listErr;
  if (!rows?.length) return;

  const top = [...rows].sort((a, b) => {
    const sum = (raw: { quarterly_data: unknown }) => {
      const qx = quarterlyJsonToAdminRecord(raw.quarterly_data as Json);
      return Y2026_QUARTERS.reduce((s, q) => s + toNum(qx[q]?.cost), 0);
    };
    return sum(b) - sum(a);
  })[0]!;

  const topQd = quarterlyJsonToAdminRecord(top.quarterly_data);
  const t4 = topQd['2026-Q4'] ?? createEmptyQuarterData();
  topQd['2026-Q4'] = {
    ...t4,
    cost: Math.max(0, toNum(t4.cost) + dust2),
    costFinanceConfirmed: true,
  };
  const { error: upErr } = await supabase
    .from('initiatives')
    .update({ quarterly_data: quarterlyDataToJson(topQd) as Json })
    .eq('id', top.id);
  if (upErr) throw upErr;
}

export type RedistributeTeamResult = {
  updatedRowIds: string[];
  usedBaseline: boolean;
};

/**
 * После удаления инициативы: перераспределить cost по % усилия внутри frozen Tq команды.
 * Доля удалённой уходит на оставшиеся строки / стаб; тотал команды не меняется.
 */
export async function redistributeTeamCosts2026InDb(
  unit: string,
  team: string,
  options?: RedistributeTeamOptions
): Promise<RedistributeTeamResult> {
  const baseline = await fetchTeamBaseline(unit, team);
  let teamRows = await fetchLiveTeamRows(unit, team);
  if (teamRows.length === 0) {
    return { updatedRowIds: [], usedBaseline: Boolean(baseline) };
  }

  if (!teamRows.some((r) => r.isTimelineStub)) {
    await findOrCreateTeamStub(unit, team);
    teamRows = await fetchLiveTeamRows(unit, team);
  }

  const frozenTq =
    options?.frozenTqByQuarter ??
    frozenTeamQuarterTotals(teamRows, [...Y2026_QUARTERS]);
  const buildOpts = { fixedTqByQuarter: frozenTq };
  const dataById = buildQuarterlyCostsForTeam(teamRows, [...Y2026_QUARTERS], buildOpts);
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

  const yearTarget = resolveTeamYearTarget(baseline, frozenTq);
  if (yearTarget > 0) {
    await applyTeamYearDust(unit, team, yearTarget);
  }

  await syncTeamSplitFromQuarterly(unit, team);

  const yearTargetFinal = resolveTeamYearTarget(baseline, frozenTq);
  if (yearTargetFinal > 0) {
    await assertTeamYearTotalMatchesTarget(unit, team, yearTargetFinal);
  }

  return { updatedRowIds, usedBaseline: Boolean(baseline) };
}

/** После redistribute: годовой cost+other команды = target (± tolerance). */
export async function assertTeamYearTotalMatchesTarget(
  unit: string,
  team: string,
  targetYearRub: number,
  toleranceRub = 1000
): Promise<void> {
  const live = await teamYearCostLive(unit, team);
  const gap = Math.round(targetYearRub) - live;
  if (Math.abs(gap) > toleranceRub) {
    throw new Error(
      `Тотал команды ${unit} / ${team}: live=${live}, цель=${Math.round(targetYearRub)}, gap=${gap}`
    );
  }
}

export function teamBaselineFromMap(
  unit: string,
  team: string,
  baselineByTeam: Map<string, TeamBaselineRow> | undefined
): TeamBaselineRow | null {
  return baselineByTeam?.get(teamBaselineKey(unit, team)) ?? null;
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
