import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildTeamBaselineMap,
  type PortfolioAnchor2026,
  type TeamBaselineRow,
} from '@/lib/budgetTruth2026';

export const BUDGET_TRUTH_2026_QUERY_KEY = ['budget_truth_2026'] as const;

type BaselineDbRow = {
  unit: string;
  team: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  rub_all: number;
  rub_pnl_it: number;
};

// Таблицы эталона 2026 пока не в сгенерированных types — запрос через untyped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

async function fetchBudgetTruth2026(): Promise<{
  anchor: PortfolioAnchor2026 | null;
  teams: TeamBaselineRow[];
  baselineByTeam: Map<string, TeamBaselineRow>;
}> {
  const [anchorRes, teamsRes] = await Promise.all([
    sb
      .from('budget_portfolio_anchor_2026')
      .select('truth_total_rub, truth_pnl_it_rub')
      .eq('id', 1)
      .maybeSingle(),
    sb.from('team_budget_baseline_2026').select('unit, team, q1, q2, q3, q4, rub_all, rub_pnl_it'),
  ]);

  if (anchorRes.error) throw anchorRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const teams: TeamBaselineRow[] = ((teamsRes.data ?? []) as BaselineDbRow[]).map((r) => ({
    unit: r.unit,
    team: r.team,
    q1: Number(r.q1) || 0,
    q2: Number(r.q2) || 0,
    q3: Number(r.q3) || 0,
    q4: Number(r.q4) || 0,
    rubAll: Number(r.rub_all) || 0,
    rubPnlIt: Number(r.rub_pnl_it) || 0,
  }));

  const anchorRow = anchorRes.data as { truth_total_rub: number; truth_pnl_it_rub: number } | null;

  return {
    anchor: anchorRow
      ? {
          truthTotalRub: Number(anchorRow.truth_total_rub) || 0,
          truthPnlItRub: Number(anchorRow.truth_pnl_it_rub) || 0,
        }
      : null,
    teams,
    baselineByTeam: buildTeamBaselineMap(teams),
  };
}

export function useBudgetTruth2026() {
  return useQuery({
    queryKey: BUDGET_TRUTH_2026_QUERY_KEY,
    queryFn: fetchBudgetTruth2026,
    staleTime: 60_000,
  });
}
