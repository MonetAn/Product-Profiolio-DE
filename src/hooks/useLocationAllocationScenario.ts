import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserDisplayName } from '@/lib/authDisplayName';
import { useToast } from '@/hooks/use-toast';
import {
  ALLOCATION_SCENARIO_AREA_ORDER,
  type AllocationScenarioArea,
} from '@/lib/allocationScenarioAreas';

export type LocationAllocationScenarioSourceTeam = {
  unit: string;
  sourceUnit: string;
  sourceTeam: string;
  name: string;
  fot2025Rub: number;
  fot2026Rub: number;
  peopleCount: number;
  runPercent: number;
};

export type LocationAllocationScenarioRegion = {
  id: string;
  teamId: string;
  region: AllocationScenarioArea;
  percent: number;
  description: string;
  sortOrder: number;
};

export type LocationAllocationScenarioTeam = {
  id: string;
  unit: string;
  sourceUnit: string | null;
  sourceTeam: string | null;
  name: string;
  description: string;
  fot2025Rub: number;
  fot2026Rub: number;
  peopleCount: number;
  runPercent: number;
  runDescription: string;
  sortOrder: number;
  isArchived: boolean;
  regions: LocationAllocationScenarioRegion[];
};

export type LocationAllocationScenarioTeamCardInput = {
  id: string;
  description: string;
  runPercent: number;
  runDescription: string;
  regions: Array<{
    region: AllocationScenarioArea;
    percent: number;
    description: string;
    sortOrder: number;
  }>;
};

type TeamPatch = Partial<
  Pick<
    LocationAllocationScenarioTeam,
    | 'name'
    | 'description'
    | 'fot2025Rub'
    | 'fot2026Rub'
    | 'peopleCount'
    | 'runPercent'
    | 'runDescription'
    | 'sortOrder'
    | 'isArchived'
  >
>;

type RegionPatch = Partial<
  Pick<LocationAllocationScenarioRegion, 'percent' | 'description' | 'sortOrder'>
>;

const QUERY_KEY = ['location-allocation-scenario'] as const;
// Сценарные таблицы добавляются новой миграцией; типы Supabase обновим вместе
// с общим следующим снимком схемы.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function normalizePercent(value: unknown): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeMoney(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeCount(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function mapRegion(row: Record<string, unknown>): LocationAllocationScenarioRegion {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    region: String(row.region) as AllocationScenarioArea,
    percent: normalizePercent(row.percent),
    description: String(row.description ?? ''),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function mapTeam(
  row: Record<string, unknown>,
  regions: LocationAllocationScenarioRegion[]
): LocationAllocationScenarioTeam {
  return {
    id: String(row.id),
    unit: String(row.unit),
    sourceUnit: row.source_unit == null ? null : String(row.source_unit),
    sourceTeam: row.source_team == null ? null : String(row.source_team),
    name: String(row.name),
    description: String(row.description ?? ''),
    fot2025Rub: normalizeMoney(row.fot_2025_rub),
    fot2026Rub: normalizeMoney(row.fot_2026_rub),
    peopleCount: normalizeCount(row.people_count),
    runPercent: normalizePercent(row.run_percent),
    runDescription: String(row.run_description ?? ''),
    sortOrder: Number(row.sort_order) || 0,
    isArchived: Boolean(row.is_archived),
    regions,
  };
}

async function authorFields() {
  const author = await getCurrentUserDisplayName();
  return {
    updated_by: author.id,
    updated_by_name: author.name,
    updated_at: new Date().toISOString(),
  };
}

export function useLocationAllocationScenario({
  sourceTeams,
  enabled = true,
}: {
  sourceTeams: LocationAllocationScenarioSourceTeam[];
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sourceSignature = useMemo(
    () =>
      sourceTeams
        .map((team) => `${team.sourceUnit}\t${team.sourceTeam}`)
        .sort()
        .join('|'),
    [sourceTeams]
  );

  const query = useQuery({
    queryKey: [...QUERY_KEY, sourceSignature],
    enabled,
    queryFn: async (): Promise<LocationAllocationScenarioTeam[]> => {
      const { data: initialTeamRows, error: teamError } = await sb
        .from('location_allocation_scenario_teams')
        .select('*')
        .order('unit')
        .order('sort_order')
        .order('name');
      let teamRows = initialTeamRows;

      if (teamError) {
        if (teamError.code === '42P01' || teamError.code === 'PGRST205') return [];
        throw teamError;
      }

      if ((teamRows ?? []).length === 0 && sourceTeams.length > 0) {
        const author = await getCurrentUserDisplayName();
        const perUnitIndex = new Map<string, number>();
        const seedRows = sourceTeams.map((team) => {
          const sortOrder = perUnitIndex.get(team.unit) ?? 0;
          perUnitIndex.set(team.unit, sortOrder + 1);
          return {
            unit: team.unit,
            source_unit: team.sourceUnit,
            source_team: team.sourceTeam,
            name: team.name,
            fot_2025_rub: normalizeMoney(team.fot2025Rub),
            fot_2026_rub: normalizeMoney(team.fot2026Rub),
            people_count: normalizeCount(team.peopleCount),
            run_percent: normalizePercent(team.runPercent),
            sort_order: sortOrder,
            created_by: author.id,
            updated_by: author.id,
            updated_by_name: author.name,
          };
        });
        const seeded = await sb
          .from('location_allocation_scenario_teams')
          .insert(seedRows)
          .select('*');
        if (seeded.error) throw seeded.error;
        teamRows = seeded.data ?? [];
        const regionSeedRows = (teamRows ?? []).flatMap(
          (team: Record<string, unknown>) =>
            ALLOCATION_SCENARIO_AREA_ORDER.map((region, sortOrder) => ({
              team_id: String(team.id),
              region,
              sort_order: sortOrder,
              created_by: author.id,
              updated_by: author.id,
              updated_by_name: author.name,
            }))
        );
        if (regionSeedRows.length > 0) {
          const regionSeed = await sb
            .from('location_allocation_scenario_regions')
            .insert(regionSeedRows);
          if (regionSeed.error) throw regionSeed.error;
        }
      }

      const { data: regionRows, error: regionError } = await sb
        .from('location_allocation_scenario_regions')
        .select('*')
        .order('sort_order')
        .order('region');
      if (regionError) throw regionError;

      const regionsByTeam = new Map<string, LocationAllocationScenarioRegion[]>();
      for (const rawRegion of regionRows ?? []) {
        const region = mapRegion(rawRegion as Record<string, unknown>);
        const bucket = regionsByTeam.get(region.teamId) ?? [];
        bucket.push(region);
        regionsByTeam.set(region.teamId, bucket);
      }

      return (teamRows ?? [])
        .map((row: Record<string, unknown>) =>
          mapTeam(row, regionsByTeam.get(String(row.id)) ?? [])
        )
        .filter((team) => !team.isArchived);
    },
    staleTime: 15_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const showError = (error: Error) => {
    toast({
      title: 'Не удалось сохранить сценарий',
      description: error.message,
      variant: 'destructive',
    });
  };

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TeamPatch }) => {
      const row: Record<string, unknown> = await authorFields();
      if ('name' in patch) row.name = patch.name?.trim();
      if ('description' in patch) row.description = patch.description ?? '';
      if ('fot2025Rub' in patch) row.fot_2025_rub = normalizeMoney(patch.fot2025Rub);
      if ('fot2026Rub' in patch) row.fot_2026_rub = normalizeMoney(patch.fot2026Rub);
      if ('peopleCount' in patch) row.people_count = normalizeCount(patch.peopleCount);
      if ('runPercent' in patch) row.run_percent = normalizePercent(patch.runPercent);
      if ('runDescription' in patch) row.run_description = patch.runDescription ?? '';
      if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
      if ('isArchived' in patch) row.is_archived = patch.isArchived;
      const { error } = await sb
        .from('location_allocation_scenario_teams')
        .update(row)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const saveTeamCardMutation = useMutation({
    mutationFn: async (input: LocationAllocationScenarioTeamCardInput) => {
      const author = await getCurrentUserDisplayName();
      const { error } = await sb.rpc('save_allocation_scenario_team_card', {
        p_team_id: input.id,
        p_description: input.description,
        p_run_percent: normalizePercent(input.runPercent),
        p_run_description: input.runDescription,
        p_regions: input.regions.map((region) => ({
          region: region.region,
          percent: normalizePercent(region.percent),
          description: region.description,
          sort_order: region.sortOrder,
        })),
        p_updated_by_name: author.name,
      });
      if (error) throw error;
    },
    onSuccess: async (_, input) => {
      queryClient.setQueriesData<LocationAllocationScenarioTeam[]>(
        { queryKey: QUERY_KEY },
        (previous) =>
          previous?.map((team) => {
            if (team.id !== input.id) return team;
            const regionByName = new Map(
              input.regions.map((region) => [region.region, region])
            );
            return {
              ...team,
              description: input.description,
              runPercent: normalizePercent(input.runPercent),
              runDescription: input.runDescription,
              regions: team.regions.map((region) => {
                const next = regionByName.get(region.region);
                return next
                  ? {
                      ...region,
                      percent: normalizePercent(next.percent),
                      description: next.description,
                      sortOrder: next.sortOrder,
                    }
                  : region;
              }),
            };
          })
      );
      await invalidate();
    },
    onError: showError,
  });

  const createTeamMutation = useMutation({
    mutationFn: async ({ unit, name }: { unit: string; name: string }) => {
      const author = await getCurrentUserDisplayName();
      const lastOrder = Math.max(
        -1,
        ...(query.data ?? [])
          .filter((team) => team.unit === unit)
          .map((team) => team.sortOrder)
      );
      const created = await sb
        .from('location_allocation_scenario_teams')
        .insert({
          unit,
          name: name.trim(),
          sort_order: lastOrder + 1,
          created_by: author.id,
          updated_by: author.id,
          updated_by_name: author.name,
        })
        .select('id')
        .single();
      if (created.error) throw created.error;
      const { error } = await sb
        .from('location_allocation_scenario_regions')
        .insert(
          ALLOCATION_SCENARIO_AREA_ORDER.map((region, sortOrder) => ({
            team_id: created.data.id,
            region,
            sort_order: sortOrder,
            created_by: author.id,
            updated_by: author.id,
            updated_by_name: author.name,
          }))
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const reorderTeamMutation = useMutation({
    mutationFn: async ({
      team,
      other,
    }: {
      team: LocationAllocationScenarioTeam;
      other: LocationAllocationScenarioTeam;
    }) => {
      const author = await authorFields();
      const first = await sb
        .from('location_allocation_scenario_teams')
        .update({ ...author, sort_order: other.sortOrder })
        .eq('id', team.id);
      if (first.error) throw first.error;
      const second = await sb
        .from('location_allocation_scenario_teams')
        .update({ ...author, sort_order: team.sortOrder })
        .eq('id', other.id);
      if (second.error) throw second.error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const reorderTeamsMutation = useMutation({
    mutationFn: async ({ teamIds }: { teamIds: string[] }) => {
      const author = await authorFields();
      for (let sortOrder = 0; sortOrder < teamIds.length; sortOrder += 1) {
        const { error } = await sb
          .from('location_allocation_scenario_teams')
          .update({ ...author, sort_order: sortOrder })
          .eq('id', teamIds[sortOrder]);
        if (error) throw error;
      }
    },
    onMutate: ({ teamIds }) => {
      const orderById = new Map(
        teamIds.map((id, sortOrder) => [id, sortOrder])
      );
      queryClient.setQueriesData<LocationAllocationScenarioTeam[]>(
        { queryKey: QUERY_KEY },
        (previous) =>
          previous?.map((team) =>
            orderById.has(team.id)
              ? { ...team, sortOrder: orderById.get(team.id) ?? team.sortOrder }
              : team
          )
      );
    },
    onSuccess: invalidate,
    onError: (error: Error) => {
      showError(error);
      void invalidate();
    },
  });

  const addRegionMutation = useMutation({
    mutationFn: async ({
      teamId,
      region,
      sortOrder,
    }: {
      teamId: string;
      region: AllocationScenarioArea;
      sortOrder: number;
    }) => {
      const author = await getCurrentUserDisplayName();
      const { error } = await sb.from('location_allocation_scenario_regions').insert({
        team_id: teamId,
        region,
        sort_order: sortOrder,
        created_by: author.id,
        updated_by: author.id,
        updated_by_name: author.name,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const updateRegionMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RegionPatch }) => {
      const row: Record<string, unknown> = await authorFields();
      if ('percent' in patch) row.percent = normalizePercent(patch.percent);
      if ('description' in patch) row.description = patch.description ?? '';
      if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
      const { error } = await sb
        .from('location_allocation_scenario_regions')
        .update(row)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const saveRegionMutation = useMutation({
    mutationFn: async ({
      teamId,
      region,
      patch,
    }: {
      teamId: string;
      region: AllocationScenarioArea;
      patch: RegionPatch;
    }) => {
      const author = await getCurrentUserDisplayName();
      const row: Record<string, unknown> = {
        team_id: teamId,
        region,
        created_by: author.id,
        updated_by: author.id,
        updated_by_name: author.name,
        updated_at: new Date().toISOString(),
      };
      if ('percent' in patch) row.percent = normalizePercent(patch.percent);
      if ('description' in patch) row.description = patch.description ?? '';
      if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
      const { error } = await sb
        .from('location_allocation_scenario_regions')
        .upsert(row, { onConflict: 'team_id,region' });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const deleteRegionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('location_allocation_scenario_regions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  return {
    ...query,
    teams: query.data ?? [],
    updateTeam: updateTeamMutation.mutateAsync,
    saveTeamCard: saveTeamCardMutation.mutateAsync,
    createTeam: createTeamMutation.mutateAsync,
    archiveTeam: (id: string) =>
      updateTeamMutation.mutateAsync({ id, patch: { isArchived: true } }),
    reorderTeam: reorderTeamMutation.mutateAsync,
    reorderTeams: reorderTeamsMutation.mutateAsync,
    addRegion: addRegionMutation.mutateAsync,
    updateRegion: updateRegionMutation.mutateAsync,
    saveRegion: saveRegionMutation.mutateAsync,
    deleteRegion: deleteRegionMutation.mutateAsync,
    isSaving:
      updateTeamMutation.isPending ||
      saveTeamCardMutation.isPending ||
      createTeamMutation.isPending ||
      reorderTeamMutation.isPending ||
      reorderTeamsMutation.isPending ||
      addRegionMutation.isPending ||
      updateRegionMutation.isPending ||
      saveRegionMutation.isPending ||
      deleteRegionMutation.isPending,
  };
}
