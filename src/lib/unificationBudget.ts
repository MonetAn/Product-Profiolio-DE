import type { AdminDataRow } from '@/lib/adminDataManager';
import { calculateBudget, treemapLeafValue } from '@/lib/dataManager';
import type { TeamBaselineRow } from '@/lib/budgetTruth2026';
import { initiativeRowToRaw } from '@/lib/crossInitiativeModel';

export type UnificationBudgetContext = {
  baselineByTeam?: Map<string, TeamBaselineRow>;
};

export function initiativeDisplayBudget(
  row: AdminDataRow | undefined,
  selectedQuarters: string[],
  ctx?: UnificationBudgetContext
): number {
  if (!row) return 0;
  return calculateBudget(initiativeRowToRaw(row), selectedQuarters, {
    includePreliminaryData: false,
    baselineByTeam: ctx?.baselineByTeam,
  });
}

/** Значение для плитки тримапа (как на дашборде): деньги или усилие, минимум 1 для раскладки. */
export function initiativeTreemapValue(
  row: AdminDataRow | undefined,
  selectedQuarters: string[],
  ctx?: UnificationBudgetContext
): number {
  if (!row) return 1;
  const raw = initiativeRowToRaw(row);
  const v = treemapLeafValue(raw, selectedQuarters, {
    includePreliminaryData: false,
    baselineByTeam: ctx?.baselineByTeam,
  });
  return Math.max(v, 1);
}
