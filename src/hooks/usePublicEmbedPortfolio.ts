import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  dbToAdminRow,
  extractQuartersFromData,
} from '@/hooks/useInitiatives';
import { normalizeSupportCascade, type AdminDataRow } from '@/lib/adminDataManager';
import {
  buildTeamBaselineMap,
  type TeamBaselineRow,
} from '@/lib/budgetTruth2026';
import type { BudgetDepartmentAllocationRow } from '@/hooks/useBudgetDepartmentAllocations';

export type PublicEmbedPortfolioData = {
  slug: string;
  unit: string;
  label: string;
  initiatives: AdminDataRow[];
  budgetDepartmentAllocations: BudgetDepartmentAllocationRow[];
  baselineByTeam: Map<string, TeamBaselineRow>;
};

type RpcInitiative = {
  id: string;
  unit: string;
  team: string;
  initiative: string;
  stakeholders_list: string[] | null;
  description: string | null;
  documentation_link: string | null;
  stakeholders: string | null;
  is_timeline_stub: boolean | null;
  quarterly_data: unknown;
  geo_cost_split: unknown;
};

type RpcAllocation = {
  initiative_id: string;
  budget_department: string;
  is_in_pnl_it: boolean;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
};

type RpcBaseline = {
  unit: string;
  team: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  rub_all: number;
  rub_pnl_it: number;
};

type RpcPayload = {
  slug: string;
  unit: string;
  label: string;
  initiatives: RpcInitiative[];
  portfolio_completed_ids: string[];
  budget_department_allocations: RpcAllocation[];
  team_baselines: RpcBaseline[];
};

function parseRpcPayload(payload: RpcPayload): PublicEmbedPortfolioData {
  const completedSet = new Set(payload.portfolio_completed_ids ?? []);

  const initiativesRaw = (payload.initiatives ?? []).map((row) =>
    dbToAdminRow(
      {
        id: row.id,
        unit: row.unit,
        team: row.team,
        initiative: row.initiative,
        stakeholders_list: row.stakeholders_list,
        description: row.description,
        documentation_link: row.documentation_link,
        stakeholders: row.stakeholders,
        is_timeline_stub: row.is_timeline_stub,
        quarterly_data: row.quarterly_data,
        geo_cost_split: row.geo_cost_split,
      },
      completedSet.has(row.id)
    )
  );

  const quarters = extractQuartersFromData(initiativesRaw);
  const initiatives = initiativesRaw.map((row) => normalizeSupportCascade(row, quarters));

  const budgetDepartmentAllocations: BudgetDepartmentAllocationRow[] = (
    payload.budget_department_allocations ?? []
  ).map((a) => ({
    initiativeId: a.initiative_id,
    budgetDepartment: a.budget_department,
    isInPnlIt: a.is_in_pnl_it ?? true,
    quarterlyBudget: {
      '2026-Q1': Number(a.q1) || 0,
      '2026-Q2': Number(a.q2) || 0,
      '2026-Q3': Number(a.q3) || 0,
      '2026-Q4': Number(a.q4) || 0,
    },
  }));

  const teams: TeamBaselineRow[] = (payload.team_baselines ?? []).map((b) => ({
    unit: b.unit,
    team: b.team,
    q1: Number(b.q1) || 0,
    q2: Number(b.q2) || 0,
    q3: Number(b.q3) || 0,
    q4: Number(b.q4) || 0,
    rubAll: Number(b.rub_all) || 0,
    rubPnlIt: Number(b.rub_pnl_it) || 0,
  }));

  return {
    slug: payload.slug,
    unit: payload.unit,
    label: payload.label,
    initiatives,
    budgetDepartmentAllocations,
    baselineByTeam: buildTeamBaselineMap(teams),
  };
}

export async function fetchPublicEmbedPortfolio(slug: string): Promise<PublicEmbedPortfolioData | null> {
  const { data, error } = await supabase.rpc('get_public_embed_portfolio', { p_slug: slug });
  if (error) throw error;
  if (!data) return null;
  return parseRpcPayload(data as RpcPayload);
}

export const PUBLIC_EMBED_QUERY_KEY = ['public_embed_portfolio'] as const;

export function usePublicEmbedPortfolio(slug: string | undefined) {
  return useQuery({
    queryKey: [...PUBLIC_EMBED_QUERY_KEY, slug],
    queryFn: () => fetchPublicEmbedPortfolio(slug!),
    enabled: Boolean(slug?.trim()),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
