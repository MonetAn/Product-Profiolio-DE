import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type SubgroupInitiativeEffortRow = {
  id: string;
  subgroup_id: string;
  initiative_id: string;
  quarterly_effort: Record<string, number>;
};

const QK = 'team_subgroup_initiative_effort' as const;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
}

export function useTeamSubgroupInitiativeEffort(
  subgroupIds: string[],
  initiativeIds: string[],
  queryEnabled: boolean
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sortedKey = [
    [...subgroupIds].sort().join('\u001f'),
    [...initiativeIds].sort().join('\u001f'),
  ].join('|');

  const query = useQuery({
    queryKey: [QK, sortedKey],
    enabled: queryEnabled && subgroupIds.length > 0 && initiativeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_subgroup_initiative_effort')
        .select('id, subgroup_id, initiative_id, quarterly_effort')
        .in('subgroup_id', subgroupIds)
        .in('initiative_id', initiativeIds);
      if (error) throw error;
      const rows: SubgroupInitiativeEffortRow[] = (data ?? []).map((r) => ({
        id: r.id as string,
        subgroup_id: r.subgroup_id as string,
        initiative_id: r.initiative_id as string,
        quarterly_effort: (r.quarterly_effort as Record<string, number>) ?? {},
      }));
      const byKey = new Map<string, SubgroupInitiativeEffortRow>();
      for (const r of rows) {
        byKey.set(`${r.subgroup_id}:${r.initiative_id}`, r);
      }
      return { rows, byKey };
    },
  });

  const upsertQuarter = useMutation({
    mutationFn: async (payload: {
      subgroupId: string;
      initiativeId: string;
      quarter: string;
      value: number;
      prevQuarterly: Record<string, number>;
    }) => {
      const { subgroupId, initiativeId, quarter, value, prevQuarterly } = payload;
      const next = { ...prevQuarterly, [quarter]: clampPct(value) };
      const { data: existing, error: selErr } = await supabase
        .from('team_subgroup_initiative_effort')
        .select('id')
        .eq('subgroup_id', subgroupId)
        .eq('initiative_id', initiativeId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing?.id) {
        const { error } = await supabase
          .from('team_subgroup_initiative_effort')
          .update({
            quarterly_effort: next as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('team_subgroup_initiative_effort').insert({
          subgroup_id: subgroupId,
          initiative_id: initiativeId,
          quarterly_effort: next as unknown as Json,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QK] });
    },
    onError: (e: Error) => {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    },
  });

  return {
    rows: query.data?.rows ?? [],
    byKey: query.data?.byKey ?? new Map<string, SubgroupInitiativeEffortRow>(),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    upsertQuarter,
    isSaving: upsertQuarter.isPending,
  };
}
