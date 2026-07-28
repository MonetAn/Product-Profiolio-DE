import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserDisplayName } from '@/lib/authDisplayName';
import { useToast } from '@/hooks/use-toast';
import { locationTeamKey } from '@/lib/locationAllocationPlanning';

export type LocationAllocationTeamMetric = {
  unit: string;
  team: string;
  fot2025Rub: number | null;
  fot2026Rub: number | null;
  unitDisplayName: string | null;
  teamDisplayName: string | null;
  peopleCountOverride: number | null;
  updatedByName: string;
  updatedAt: string | null;
};

type MetricPatch = {
  unit: string;
  team: string;
  fot2025Rub?: number | null;
  fot2026Rub?: number | null;
  teamDisplayName?: string | null;
  peopleCountOverride?: number | null;
};

const QUERY_KEY = ['location-allocation-team-metrics'] as const;
// Новая таблица появится после миграции, поэтому клиент до регенерации типов untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useLocationAllocationTeamMetrics({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async (): Promise<LocationAllocationTeamMetric[]> => {
      const { data, error } = await sb
        .from('location_allocation_team_metrics')
        .select(
          'unit, team, fot_2025_rub, fot_2026_rub, unit_display_name, team_display_name, people_count_override, updated_by_name, updated_at'
        );
      if (error) {
        // До применения миграции командный вид остаётся доступен в расчётном режиме.
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []).map((row: Record<string, unknown>) => ({
        unit: String(row.unit ?? ''),
        team: String(row.team ?? ''),
        fot2025Rub:
          row.fot_2025_rub == null ? null : Math.max(0, Number(row.fot_2025_rub) || 0),
        fot2026Rub:
          row.fot_2026_rub == null ? null : Math.max(0, Number(row.fot_2026_rub) || 0),
        unitDisplayName:
          typeof row.unit_display_name === 'string' && row.unit_display_name.trim()
            ? row.unit_display_name.trim()
            : null,
        teamDisplayName:
          typeof row.team_display_name === 'string' && row.team_display_name.trim()
            ? row.team_display_name.trim()
            : null,
        peopleCountOverride:
          row.people_count_override == null
            ? null
            : Math.max(0, Math.round(Number(row.people_count_override) || 0)),
        updatedByName: String(row.updated_by_name ?? ''),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
      }));
    },
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: MetricPatch) => {
      const author = await getCurrentUserDisplayName();
      const row: Record<string, unknown> = {
        unit: patch.unit,
        team: patch.team,
        updated_by: author.id,
        updated_by_name: author.name,
        updated_at: new Date().toISOString(),
      };
      if ('fot2025Rub' in patch) row.fot_2025_rub = patch.fot2025Rub;
      if ('fot2026Rub' in patch) row.fot_2026_rub = patch.fot2026Rub;
      if ('teamDisplayName' in patch) {
        row.team_display_name = patch.teamDisplayName?.trim() || null;
      }
      if ('peopleCountOverride' in patch) {
        row.people_count_override = patch.peopleCountOverride;
      }
      const { error } = await sb
        .from('location_allocation_team_metrics')
        .upsert(row, { onConflict: 'unit,team' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Значение сохранено' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Не удалось сохранить',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveUnitDisplayNameMutation = useMutation({
    mutationFn: async ({
      unit,
      teams,
      displayName,
    }: {
      unit: string;
      teams: string[];
      displayName: string | null;
    }) => {
      const author = await getCurrentUserDisplayName();
      const updatedAt = new Date().toISOString();
      const rows = teams.map((team) => ({
        unit,
        team,
        unit_display_name: displayName?.trim() || null,
        updated_by: author.id,
        updated_by_name: author.name,
        updated_at: updatedAt,
      }));
      if (rows.length === 0) return;
      const { error } = await sb
        .from('location_allocation_team_metrics')
        .upsert(rows, { onConflict: 'unit,team' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Название юнита сохранено' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Не удалось сохранить',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const byTeam = new Map(
    (query.data ?? []).map((metric) => [
      locationTeamKey(metric.unit, metric.team),
      metric,
    ])
  );

  return {
    ...query,
    byTeam,
    saveMetric: saveMutation.mutateAsync,
    saveUnitDisplayName: saveUnitDisplayNameMutation.mutateAsync,
    isSaving: saveMutation.isPending || saveUnitDisplayNameMutation.isPending,
  };
}
