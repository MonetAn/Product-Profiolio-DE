import { supabase } from '@/integrations/supabase/client';
import {
  type AdminDataRow,
  AdminQuarterData,
  createEmptyQuarterData,
  isQuarterPeriodKey,
} from '@/lib/adminDataManager';
import { teamQuarterCostSum } from '@/lib/adminEffortTreemapPreviewModel';
import { quarterlyDataToJson, quarterlyJsonToAdminRecord } from '@/hooks/useInitiatives';
import type { Json } from '@/integrations/supabase/types';

const Y2026_QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

type BudgetSplitRow = {
  budget_department: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  is_in_pnl_it: boolean;
};

type TeamStubRow = {
  id: string;
  initiative: string;
  created_at: string | null;
};

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Предпочитаем «настоящую» заглушку команды (ФОТ / стоимость команды), не случайную инициативу с флагом. */
export function pickCanonicalTeamStub(stubs: TeamStubRow[]): TeamStubRow | null {
  if (stubs.length === 0) return null;
  if (stubs.length === 1) return stubs[0];

  const score = (s: TeamStubRow): number => {
    const name = (s.initiative ?? '').toLowerCase();
    let v = 0;
    if (/стоимость команды|фот/.test(name)) v += 100;
    if (/2026/.test(name)) v += 10;
    return v;
  };

  return [...stubs].sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    return ca.localeCompare(cb);
  })[0];
}

function sumQuarterlyCost2026(
  quarterlyData: Record<string, AdminQuarterData> | undefined
): Record<(typeof Y2026_QUARTERS)[number], number> {
  const out: Record<string, number> = {};
  for (const q of Y2026_QUARTERS) out[q] = 0;
  if (!quarterlyData) return out as Record<(typeof Y2026_QUARTERS)[number], number>;
  for (const q of Y2026_QUARTERS) {
    const cost = quarterlyData[q]?.cost ?? 0;
    const other = quarterlyData[q]?.otherCosts ?? 0;
    out[q] = Math.max(0, toNum(cost) + toNum(other));
  }
  return out as Record<(typeof Y2026_QUARTERS)[number], number>;
}

function quarterlyCostsFromSplitRows(rows: BudgetSplitRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of Y2026_QUARTERS) out[q] = 0;
  for (const r of rows) {
    out['2026-Q1'] += toNum(r.q1);
    out['2026-Q2'] += toNum(r.q2);
    out['2026-Q3'] += toNum(r.q3);
    out['2026-Q4'] += toNum(r.q4);
  }
  return out;
}

async function fetchBudgetRows(initiativeId: string): Promise<BudgetSplitRow[]> {
  const { data, error } = await (supabase as any)
    .from('initiative_budget_department_2026')
    .select('budget_department, q1, q2, q3, q4, is_in_pnl_it')
    .eq('initiative_id', initiativeId);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw: Record<string, unknown>) => ({
    budget_department: String(raw.budget_department ?? '').trim() || 'Без бюджетного подразделения',
    q1: toNum(raw.q1),
    q2: toNum(raw.q2),
    q3: toNum(raw.q3),
    q4: toNum(raw.q4),
    is_in_pnl_it: raw.is_in_pnl_it !== false,
  }));
}

async function upsertSplitAddition(stubId: string, delta: BudgetSplitRow): Promise<void> {
  const { data: existing, error: readErr } = await (supabase as any)
    .from('initiative_budget_department_2026')
    .select('q1, q2, q3, q4, is_in_pnl_it')
    .eq('initiative_id', stubId)
    .eq('budget_department', delta.budget_department)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const { error } = await (supabase as any)
      .from('initiative_budget_department_2026')
      .update({
        q1: toNum(existing.q1) + delta.q1,
        q2: toNum(existing.q2) + delta.q2,
        q3: toNum(existing.q3) + delta.q3,
        q4: toNum(existing.q4) + delta.q4,
        is_in_pnl_it: Boolean(existing.is_in_pnl_it) || delta.is_in_pnl_it,
        updated_at: new Date().toISOString(),
      })
      .eq('initiative_id', stubId)
      .eq('budget_department', delta.budget_department);
    if (error) throw error;
    return;
  }

  const { error } = await (supabase as any).from('initiative_budget_department_2026').insert({
    initiative_id: stubId,
    budget_department: delta.budget_department,
    q1: delta.q1,
    q2: delta.q2,
    q3: delta.q3,
    q4: delta.q4,
    is_in_pnl_it: delta.is_in_pnl_it,
  });
  if (error) throw error;
}

/**
 * Доля бюджета команды по % усилия (как при сохранении Quick Flow), если в quarterly cost=0.
 * Tq — сумма cost+other по всей команде в квартале (включая удаляемую строку).
 */
export function computeTransferAddFromEffort(
  quarterlyData: Record<string, AdminQuarterData> | undefined,
  teamRows: AdminDataRow[]
): Record<(typeof Y2026_QUARTERS)[number], number> {
  const out: Record<string, number> = {};
  for (const q of Y2026_QUARTERS) out[q] = 0;
  if (!quarterlyData || teamRows.length === 0) {
    return out as Record<(typeof Y2026_QUARTERS)[number], number>;
  }

  for (const q of Y2026_QUARTERS) {
    const qd = quarterlyData[q] ?? createEmptyQuarterData();
    const eff = Math.max(0, Math.min(100, toNum(qd.effortCoefficient)));
    if (eff <= 0) continue;
    const Tq = teamQuarterCostSum(teamRows, q);
    if (Tq <= 0) continue;
    const other = toNum(qd.otherCosts);
    out[q] = Math.max(0, Math.round((eff / 100) * Tq) - other);
  }
  return out as Record<(typeof Y2026_QUARTERS)[number], number>;
}

/** Сколько переносить на заглушку: quarterly → split → доля по % усилия в команде. */
export function computeTransferAddByQuarter(
  quarterlyData: Record<string, AdminQuarterData> | undefined,
  splitRows: BudgetSplitRow[],
  teamRows?: AdminDataRow[]
): Record<(typeof Y2026_QUARTERS)[number], number> {
  const quarterlyAdd = sumQuarterlyCost2026(quarterlyData);
  const quarterlySum = Y2026_QUARTERS.reduce((s, q) => s + quarterlyAdd[q], 0);
  if (quarterlySum > 0) return quarterlyAdd;

  const fromSplit = quarterlyCostsFromSplitRows(splitRows);
  const splitSum = Y2026_QUARTERS.reduce((s, q) => s + (fromSplit[q] ?? 0), 0);
  if (splitSum > 0) {
    return fromSplit as Record<(typeof Y2026_QUARTERS)[number], number>;
  }

  if (teamRows && teamRows.length > 0) {
    const fromEffort = computeTransferAddFromEffort(quarterlyData, teamRows);
    const effortSum = Y2026_QUARTERS.reduce((s, q) => s + (fromEffort[q] ?? 0), 0);
    if (effortSum > 0) return fromEffort;
  }

  return quarterlyAdd;
}

export function hasTransferableBudget(
  quarterlyData: Record<string, AdminQuarterData> | undefined,
  splitRows: BudgetSplitRow[],
  teamRows?: AdminDataRow[]
): boolean {
  const add = computeTransferAddByQuarter(quarterlyData, splitRows, teamRows);
  return Y2026_QUARTERS.some((q) => (add[q] ?? 0) > 0);
}

async function fetchTeamRowsForTransfer(unit: string, team: string): Promise<AdminDataRow[]> {
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

async function addQuarterlyCostToStub(
  stubId: string,
  addByQuarter: Record<string, number>
): Promise<void> {
  const hasAdd = Y2026_QUARTERS.some((q) => (addByQuarter[q] ?? 0) > 0);
  if (!hasAdd) return;

  const { data: initRow, error: readErr } = await supabase
    .from('initiatives')
    .select('quarterly_data')
    .eq('id', stubId)
    .single();
  if (readErr) throw readErr;

  const qd = quarterlyJsonToAdminRecord(initRow?.quarterly_data);
  for (const q of Y2026_QUARTERS) {
    const add = addByQuarter[q] ?? 0;
    if (add <= 0) continue;
    const cur = qd[q] ?? createEmptyQuarterData();
    qd[q] = { ...cur, cost: Math.max(0, toNum(cur.cost) + add) };
  }

  const { error } = await supabase
    .from('initiatives')
    .update({ quarterly_data: quarterlyDataToJson(qd) as Json })
    .eq('id', stubId);
  if (error) throw error;
}

async function zeroInitiative2026Costs(initiativeId: string): Promise<void> {
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
  if (!changed) return;

  const { error } = await supabase
    .from('initiatives')
    .update({ quarterly_data: quarterlyDataToJson(qd) as Json })
    .eq('id', initiativeId);
  if (error) throw error;
}

export async function findOrCreateTeamStub(unit: string, team: string): Promise<string> {
  const { data: stubs, error } = await supabase
    .from('initiatives')
    .select('id, initiative, created_at')
    .eq('unit', unit)
    .eq('team', team)
    .eq('is_timeline_stub', true)
    .is('deleted_at', null);
  if (error) throw error;

  const list = (stubs ?? []) as TeamStubRow[];
  const canonical = pickCanonicalTeamStub(list);
  if (canonical) return canonical.id;

  const { data: created, error: insertErr } = await supabase
    .from('initiatives')
    .insert({
      unit,
      team,
      initiative: `Стоимость команды ${team} 2026`,
      is_timeline_stub: true,
      stakeholders_list: [],
      description: '',
      documentation_link: '',
      stakeholders: '',
      quarterly_data: quarterlyDataToJson({}) as Json,
    })
    .select('id')
    .single();
  if (insertErr) throw insertErr;
  return created.id;
}

export type TransferBudgetResult = {
  transferred: boolean;
  stubId: string | null;
};

/**
 * Переносит бюджет удаляемой инициативы на единственную заглушку команды («Не распределено»).
 * Вызывать до soft-delete.
 */
export async function transferInitiativeBudgetToTeamStub(
  initiativeId: string
): Promise<TransferBudgetResult> {
  const { data: row, error } = await supabase
    .from('initiatives')
    .select('id, unit, team, is_timeline_stub, quarterly_data')
    .eq('id', initiativeId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { transferred: false, stubId: null };
  if (row.is_timeline_stub) return { transferred: false, stubId: null };

  const unit = (row.unit ?? '').trim();
  const team = (row.team ?? '').trim();
  if (!unit || !team) return { transferred: false, stubId: null };

  const splitRows = await fetchBudgetRows(initiativeId);
  const quarterlyRecord = quarterlyJsonToAdminRecord(row.quarterly_data);
  const teamRows = await fetchTeamRowsForTransfer(unit, team);
  const addByQuarter = computeTransferAddByQuarter(quarterlyRecord, splitRows, teamRows);

  if (!hasTransferableBudget(quarterlyRecord, splitRows, teamRows)) {
    return { transferred: false, stubId: null };
  }

  const stubId = await findOrCreateTeamStub(unit, team);

  for (const delta of splitRows) {
    await upsertSplitAddition(stubId, delta);
  }

  if (splitRows.length > 0) {
    const { error: delErr } = await (supabase as any)
      .from('initiative_budget_department_2026')
      .delete()
      .eq('initiative_id', initiativeId);
    if (delErr) throw delErr;
  }

  // Накапливаем cost на заглушке. syncStubQuarterlyCostFromSplit не вызываем:
  // он перезаписывает quarterly только из split и теряет уже лежащие на стабе деньги.
  await addQuarterlyCostToStub(stubId, addByQuarter);

  await zeroInitiative2026Costs(initiativeId);

  return { transferred: true, stubId };
}
