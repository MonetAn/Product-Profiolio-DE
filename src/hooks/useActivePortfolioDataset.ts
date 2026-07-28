import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  dbToAdminRow,
  extractQuartersFromData,
} from '@/hooks/useInitiatives';
import type { BudgetDepartmentAllocationRow } from '@/hooks/useBudgetDepartmentAllocations';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { normalizeSupportCascade } from '@/lib/adminDataManager';
import {
  buildTeamBaselineMap,
  type PortfolioAnchor2026,
  type TeamBaselineRow,
} from '@/lib/budgetTruth2026';
import {
  parseCrossInitiativesBundle,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';

export type ActivePortfolioDatasetMeta = {
  id: string;
  code: string;
  label: string;
  kind: 'live' | 'snapshot';
  periodStart: string | null;
  periodEnd: string | null;
  snapshotAt: string;
  notes: string | null;
};

export type ActivePortfolioDataset = {
  dataset: ActivePortfolioDatasetMeta;
  initiatives: AdminDataRow[];
  budgetDepartmentAllocations: BudgetDepartmentAllocationRow[];
  budgetTruth2026: {
    anchor: PortfolioAnchor2026 | null;
    teams: TeamBaselineRow[];
    baselineByTeam: Map<string, TeamBaselineRow>;
  };
  crossBundle: CrossInitiativesBundle;
};

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value).trim();
  return result || null;
}

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function parseActiveDataset(payload: unknown): ActivePortfolioDataset | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as JsonRecord;
  const datasetRaw =
    root.dataset && typeof root.dataset === 'object' && !Array.isArray(root.dataset)
      ? (root.dataset as JsonRecord)
      : null;
  if (!datasetRaw || !stringValue(datasetRaw.id)) return null;

  const completedIds = new Set(
    records(root.initiative_portfolio_meta)
      .filter((row) => row.is_portfolio_completed === true)
      .map((row) => stringValue(row.initiative_id))
      .filter(Boolean)
  );

  const initiativeDbRows = records(root.initiatives);
  const initiativesRaw = initiativeDbRows.map((row) =>
    dbToAdminRow(row as never, completedIds.has(stringValue(row.id)))
  );
  const quarters = extractQuartersFromData(initiativesRaw);
  const initiatives = initiativesRaw.map((row) => normalizeSupportCascade(row, quarters));
  const initiativeById = new Map(initiatives.map((row) => [row.id, row]));

  const budgetDepartmentAllocations: BudgetDepartmentAllocationRow[] = records(
    root.budget_department_allocations
  )
    .map((row) => {
      const initiativeId = stringValue(row.initiative_id);
      if (!initiativeId) return null;
      return {
        initiativeId,
        budgetDepartment:
          nullableString(row.budget_department) ?? 'Без бюджетного подразделения',
        isInPnlIt: row.is_in_pnl_it !== false,
        quarterlyBudget: {
          '2026-Q1': numberValue(row.q1),
          '2026-Q2': numberValue(row.q2),
          '2026-Q3': numberValue(row.q3),
          '2026-Q4': numberValue(row.q4),
        },
      } satisfies BudgetDepartmentAllocationRow;
    })
    .filter((row): row is BudgetDepartmentAllocationRow => row !== null);

  const teams: TeamBaselineRow[] = records(root.team_baselines).map((row) => ({
    unit: stringValue(row.unit),
    team: stringValue(row.team),
    q1: numberValue(row.q1),
    q2: numberValue(row.q2),
    q3: numberValue(row.q3),
    q4: numberValue(row.q4),
    rubAll: numberValue(row.rub_all),
    rubPnlIt: numberValue(row.rub_pnl_it),
  }));
  const anchorRow = records(root.budget_anchor)[0];
  const anchor = anchorRow
    ? {
        truthTotalRub: numberValue(anchorRow.truth_total_rub),
        truthPnlItRub: numberValue(anchorRow.truth_pnl_it_rub),
      }
    : null;

  const crossMembers = records(root.cross_initiative_members).map((member) => {
    const initiative = initiativeById.get(stringValue(member.initiative_id));
    return {
      ...member,
      initiative_name: initiative?.initiative ?? '—',
      unit: initiative?.unit ?? '',
      team: initiative?.team ?? '',
      can_view_details: Boolean(initiative),
    };
  });
  const crossBundle = parseCrossInitiativesBundle({
    cross_initiatives: records(root.cross_initiatives),
    members: crossMembers,
  });
  const usedCrossIds = new Set(crossBundle.members.map((member) => member.cross_initiative_id));

  return {
    dataset: {
      id: stringValue(datasetRaw.id),
      code: stringValue(datasetRaw.code),
      label: stringValue(datasetRaw.label),
      kind: datasetRaw.kind === 'snapshot' ? 'snapshot' : 'live',
      periodStart: nullableString(datasetRaw.period_start),
      periodEnd: nullableString(datasetRaw.period_end),
      snapshotAt: stringValue(datasetRaw.snapshot_at),
      notes: nullableString(datasetRaw.notes),
    },
    initiatives,
    budgetDepartmentAllocations,
    budgetTruth2026: {
      anchor,
      teams,
      baselineByTeam: buildTeamBaselineMap(teams),
    },
    crossBundle: {
      crossInitiatives: crossBundle.crossInitiatives.filter((cross) => usedCrossIds.has(cross.id)),
      members: crossBundle.members,
    },
  };
}

export const ACTIVE_PORTFOLIO_DATASET_QUERY_KEY = ['active_portfolio_dataset'] as const;

type ActiveDatasetRpcClient = {
  rpc: (
    functionName: string
  ) => PromiseLike<{ data: unknown; error: Error | null }>;
};

const activeDatasetSupabase = supabase as unknown as ActiveDatasetRpcClient;

export async function fetchActivePortfolioDataset(): Promise<ActivePortfolioDataset | null> {
  const { data, error } = await activeDatasetSupabase.rpc('get_active_portfolio_dataset');
  if (error) throw error;
  return parseActiveDataset(data);
}

export function useActivePortfolioDataset() {
  return useQuery({
    queryKey: ACTIVE_PORTFOLIO_DATASET_QUERY_KEY,
    queryFn: fetchActivePortfolioDataset,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
