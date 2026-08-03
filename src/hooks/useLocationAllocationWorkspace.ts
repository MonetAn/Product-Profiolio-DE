import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  dbToAdminRow,
} from '@/hooks/useInitiatives';
import {
  geoCostSplitToJson,
  normalizeSupportCascade,
  type AdminDataRow,
  type GeoCostSplit,
} from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { LocationAllocationTeamMetric } from '@/hooks/useLocationAllocationTeamMetrics';
import type { InitiativeTag } from '@/lib/initiativeTags';

type WorkspacePayload = {
  dataset?: Record<string, unknown>;
  read_only?: unknown;
  initiatives?: Record<string, unknown>[];
  portfolio_meta?: { initiative_id?: unknown }[];
  countries?: Record<string, unknown>[];
  team_metrics?: Record<string, unknown>[];
};

export type LocationAllocationDatasetMeta = {
  id: string | null;
  code: string;
  label: string;
  kind: 'live' | 'snapshot';
  periodStart: string | null;
  periodEnd: string | null;
  snapshotAt: string | null;
  notes: string | null;
};

export type LocationAllocationWorkspace = {
  dataset: LocationAllocationDatasetMeta;
  readOnly: boolean;
  initiatives: AdminDataRow[];
  countries: MarketCountryRow[];
  teamMetrics: LocationAllocationTeamMetric[];
};

export const LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY = [
  'location-allocation-workspace',
] as const;

// RPC добавлен отдельной миграцией и намеренно не зависит от сгенерированных типов.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parsePayload(value: unknown): LocationAllocationWorkspace {
  const payload =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as WorkspacePayload)
      : {};
  const dataset =
    payload.dataset &&
    typeof payload.dataset === 'object' &&
    !Array.isArray(payload.dataset)
      ? payload.dataset
      : {};
  const completedIds = new Set(
    (payload.portfolio_meta ?? [])
      .map((row) => String(row.initiative_id ?? ''))
      .filter(Boolean)
  );
  const initiatives = (payload.initiatives ?? []).map((row) =>
    dbToAdminRow(
      row as never,
      completedIds.has(String(row.id ?? ''))
    )
  );
  const quarters = [
    ...new Set(initiatives.flatMap((row) => Object.keys(row.quarterlyData))),
  ].sort();

  return {
    dataset: {
      id: nullableString(dataset.id),
      code: nullableString(dataset.code) ?? 'live',
      label: nullableString(dataset.label) ?? 'Текущие данные',
      kind: dataset.kind === 'snapshot' ? 'snapshot' : 'live',
      periodStart: nullableString(dataset.period_start),
      periodEnd: nullableString(dataset.period_end),
      snapshotAt: nullableString(dataset.snapshot_at),
      notes: nullableString(dataset.notes),
    },
    readOnly: payload.read_only === true || dataset.kind === 'snapshot',
    initiatives: initiatives.map((row) =>
      normalizeSupportCascade(row, quarters)
    ),
    countries: (payload.countries ?? []) as MarketCountryRow[],
    teamMetrics: (payload.team_metrics ?? []).map((row) => ({
      unit: String(row.unit ?? ''),
      team: String(row.team ?? ''),
      fot2025Rub:
        row.fot_2025_rub == null
          ? null
          : Math.max(0, Number(row.fot_2025_rub) || 0),
      fot2026Rub:
        row.fot_2026_rub == null
          ? null
          : Math.max(0, Number(row.fot_2026_rub) || 0),
      unitDisplayName: nullableString(row.unit_display_name),
      teamDisplayName: nullableString(row.team_display_name),
      runPercentOverride:
        row.run_percent_override == null
          ? null
          : Math.max(
              0,
              Math.min(100, Number(row.run_percent_override) || 0)
            ),
      updatedByName: String(row.updated_by_name ?? ''),
      updatedAt: nullableString(row.updated_at),
    })),
  };
}

export function useLocationAllocationWorkspace() {
  return useQuery({
    queryKey: LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await sb.rpc(
        'get_location_allocation_workspace'
      );
      if (error) throw error;
      return parsePayload(data);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useLocationAllocationGeoSplitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      initiativeId,
      split,
    }: {
      initiativeId: string;
      split: GeoCostSplit | undefined;
    }) => {
      const { error } = await sb.rpc(
        'set_location_allocation_geo_split',
        {
          p_initiative_id: initiativeId,
          p_geo_cost_split: split?.entries?.length
            ? geoCostSplitToJson(split)
            : null,
        }
      );
      if (error) throw error;
      return { initiativeId, split };
    },
    onSuccess: ({ initiativeId, split }) => {
      queryClient.setQueryData<LocationAllocationWorkspace>(
        LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY,
        (previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            initiatives: previous.initiatives.map((row) =>
              row.id === initiativeId
                ? { ...row, initiativeGeoCostSplit: split }
                : row
            ),
          };
        }
      );
    },
  });
}

export function useLocationAllocationInitiativeTagsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      initiativeId,
      tags,
    }: {
      initiativeId: string;
      tags: InitiativeTag[];
    }) => {
      const { error } = await sb.rpc(
        'set_location_allocation_initiative_tags',
        {
          p_initiative_id: initiativeId,
          p_tags: tags,
        }
      );
      if (error) throw error;
      return { initiativeId, tags };
    },
    onSuccess: ({ initiativeId, tags }) => {
      queryClient.setQueryData<LocationAllocationWorkspace>(
        LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY,
        (previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            initiatives: previous.initiatives.map((row) =>
              row.id === initiativeId ? { ...row, tags } : row
            ),
          };
        }
      );
    },
  });
}
