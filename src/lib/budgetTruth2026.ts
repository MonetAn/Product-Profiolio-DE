/**
 * Единая логика бюджета 2026 для дашборда и админки.
 *
 * Источник истины по командам: team_budget_baseline_2026 + budget_portfolio_anchor_2026.
 * На инициативах: initiatives.quarterly_data (cost + otherCosts) после reapply / align SQL.
 */

export type BudgetDeptAlloc = {
  budgetDepartment: string;
  isInPnlIt: boolean;
  quarterlyBudget: Record<string, number>;
};

export type InitiativeBudgetRow = {
  unit: string;
  team: string;
  quarterlyData: Record<string, { budget?: number }>;
  budgetDepartmentAllocations?: BudgetDeptAlloc[];
};

export type TeamBaselineRow = {
  unit: string;
  team: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  rubAll: number;
  rubPnlIt: number;
};

export type PortfolioAnchor2026 = {
  truthTotalRub: number;
  truthPnlItRub: number;
};

const Q2026 = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

export function is2026Quarter(quarter: string): boolean {
  return /^2026-Q[1-4]$/i.test(quarter);
}

export function teamBaselineKey(unit: string, team: string): string {
  return `${unit}\t${team}`;
}

export function buildTeamBaselineMap(rows: TeamBaselineRow[]): Map<string, TeamBaselineRow> {
  const m = new Map<string, TeamBaselineRow>();
  for (const r of rows) {
    m.set(teamBaselineKey(r.unit, r.team), r);
  }
  return m;
}

/** Доля PnL IT команды из LIST1: rub_pnl_it / rub_all. Нет baseline → 0 (вне эталона). */
export function teamPnlShareFromBaseline(
  unit: string,
  team: string,
  baselineByTeam: Map<string, TeamBaselineRow> | undefined
): number {
  const b = baselineByTeam?.get(teamBaselineKey(unit, team));
  if (!b || b.rubAll <= 0) return 0;
  return Math.max(0, Math.min(1, b.rubPnlIt / b.rubAll));
}

/**
 * Бюджет инициативы за период.
 * — «Все»: cost из quarterly (= rub_all команды по сумме).
 * — «Только PnL IT»: cost × (rub_pnl_it / rub_all) команды; где доля 0 — инициатива не видна.
 *   Split по департаментам на дашборде не режем — не знаем, с какой инициативы снимать non-PnL.
 */
export function sumInitiativeBudgetForQuarters(
  row: InitiativeBudgetRow,
  quarters: string[],
  options?: {
    includeNonPnlBudgets?: boolean;
    baselineByTeam?: Map<string, TeamBaselineRow>;
  }
): number {
  const includeAll = options?.includeNonPnlBudgets ?? true;
  const baselineByTeam = options?.baselineByTeam;
  const pnlShare = teamPnlShareFromBaseline(row.unit, row.team, baselineByTeam);

  return quarters.reduce((sum, quarter) => {
    const qBudget = row.quarterlyData[quarter]?.budget ?? 0;
    if (qBudget <= 0) return sum;
    if (includeAll) return sum + qBudget;
    return sum + qBudget * pnlShare;
  }, 0);
}

export function isFullYear2026Selection(selectedQuarters: string[]): boolean {
  if (selectedQuarters.length !== 4) return false;
  const set = new Set(selectedQuarters);
  return Q2026.every((q) => set.has(q));
}

export function filterQuarters2026(quarters: string[]): string[] {
  return quarters.filter((q) => is2026Quarter(q));
}

/**
 * Период по умолчанию для дашборда и кросс-инициатив в админке: все кварталы 2026 из каталога.
 * (Не один «текущий» квартал — иначе суммы в 2–4 раза ниже годового среза.)
 */
export function defaultPortfolioQuarters2026(availableQuarters: string[]): string[] {
  const q2026 = filterQuarters2026(availableQuarters);
  if (q2026.length > 0) return q2026;
  return availableQuarters.length > 0 ? [...availableQuarters] : [];
}

export function formatBudgetPeriodLabel(quarters: string[]): string {
  if (quarters.length === 0) return '';
  if (isFullYear2026Selection(quarters)) return '2026 (Q1–Q4)';
  const sorted = [...quarters].sort();
  if (sorted.length === 1) return sorted[0]!;
  return sorted.join(', ');
}

export function isOnly2026Quarters(selectedQuarters: string[]): boolean {
  return selectedQuarters.length > 0 && selectedQuarters.every((q) => is2026Quarter(q));
}

/** Эталон LIST1 для сверки в SQL/админке; дашборд суммирует initiatives по фильтрам. */
export function portfolioAnchorTotal(
  anchor: PortfolioAnchor2026 | null | undefined,
  selectedQuarters: string[],
  includeNonPnlBudgets: boolean
): number | null {
  if (!anchor || !isFullYear2026Selection(selectedQuarters)) return null;
  return includeNonPnlBudgets ? anchor.truthTotalRub : anchor.truthPnlItRub;
}
