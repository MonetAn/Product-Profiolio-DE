import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BudgetDepartmentAllocationRow {
  initiativeId: string;
  budgetDepartment: string;
  isInPnlIt: boolean;
  quarterlyBudget: Record<string, number>;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

function pickString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

function pickInitiativeId(record: Record<string, unknown>): string {
  return pickString(record, ['initiative_id', 'initiativeId']);
}

function pickBudgetDepartment(record: Record<string, unknown>): string {
  return pickString(record, ['budget_department', 'budgetDepartment', 'department'], 'Без бюджетного подразделения');
}

function pickQuarterlyBudget(record: Record<string, unknown>): Record<string, number> {
  return {
    '2026-Q1': toNumber(record.q1 ?? record['2026_q1'] ?? record['2026-Q1']),
    '2026-Q2': toNumber(record.q2 ?? record['2026_q2'] ?? record['2026-Q2']),
    '2026-Q3': toNumber(record.q3 ?? record['2026_q3'] ?? record['2026-Q3']),
    '2026-Q4': toNumber(record.q4 ?? record['2026_q4'] ?? record['2026-Q4']),
  };
}

async function fetchBudgetDepartmentAllocations(): Promise<BudgetDepartmentAllocationRow[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from('initiative_budget_department_2026')
      .select('*')
      .order('initiative_id', { ascending: true })
      .order('budget_department', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const batch = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows
    .map((raw) => {
      const record = (raw || {}) as Record<string, unknown>;
      const initiativeId = pickInitiativeId(record);
      if (!initiativeId) return null;

      return {
        initiativeId,
        budgetDepartment: pickBudgetDepartment(record),
        isInPnlIt: pickBoolean(
          record,
          ['is_in_pnl_it', 'isInPnlIt', 'pnl_it', 'in_pnl_it', 'is_pnl_it'],
          true
        ),
        quarterlyBudget: pickQuarterlyBudget(record),
      } as BudgetDepartmentAllocationRow;
    })
    .filter((row): row is BudgetDepartmentAllocationRow => row !== null);
}

export const BUDGET_DEPARTMENT_ALLOCATIONS_QUERY_KEY = ['initiative_budget_department_2026'] as const;

export function useBudgetDepartmentAllocations() {
  return useQuery({
    queryKey: BUDGET_DEPARTMENT_ALLOCATIONS_QUERY_KEY,
    queryFn: fetchBudgetDepartmentAllocations,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });
}
