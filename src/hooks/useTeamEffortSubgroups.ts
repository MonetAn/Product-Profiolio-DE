import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TeamEffortSubgroupRow = {
  id: string;
  unit: string;
  team: string;
  name: string;
  sort_order: number;
  created_at: string;
};

const QK = 'team_effort_subgroups' as const;

type UseTeamEffortSubgroupsOptions = {
  /** false — не грузим подгруппы (например, режим «только по людям»). */
  queryEnabled?: boolean;
};

export function useTeamEffortSubgroups(
  unit: string | null,
  team: string | null,
  options?: UseTeamEffortSubgroupsOptions
) {
  const queryClient = useQueryClient();
  const scopeOk = Boolean(unit?.trim() && team?.trim());
  const enabled = scopeOk && (options?.queryEnabled !== false);

  const query = useQuery({
    queryKey: [QK, unit, team],
    enabled,
    queryFn: async () => {
      const u = unit!.trim();
      const t = team!.trim();
      const { data: subgroups, error: e1 } = await supabase
        .from('team_effort_subgroups')
        .select('id, unit, team, name, sort_order, created_at')
        .eq('unit', u)
        .eq('team', t)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (e1) throw e1;
      const list = (subgroups ?? []) as TeamEffortSubgroupRow[];
      const ids = list.map((s) => s.id);
      const membership = new Map<string, string>();
      if (ids.length > 0) {
        const { data: members, error: e2 } = await supabase
          .from('team_effort_subgroup_members')
          .select('subgroup_id, person_id')
          .in('subgroup_id', ids);
        if (e2) throw e2;
        for (const m of members ?? []) {
          membership.set(m.person_id as string, m.subgroup_id as string);
        }
      }
      return { subgroups: list, membership };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QK, unit, team] });
  };

  const createSubgroup = useMutation({
    mutationFn: async (name: string) => {
      if (!enabled) throw new Error('no scope');
      const u = unit!.trim();
      const t = team!.trim();
      const { data: maxRows, error: maxErr } = await supabase
        .from('team_effort_subgroups')
        .select('sort_order')
        .eq('unit', u)
        .eq('team', t)
        .order('sort_order', { ascending: false })
        .limit(1);
      if (maxErr) throw maxErr;
      const nextSort = (maxRows?.[0]?.sort_order ?? -1) + 1;
      const { data, error } = await supabase
        .from('team_effort_subgroups')
        .insert({
          unit: u,
          team: t,
          name: name.trim(),
          sort_order: nextSort,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id;
    },
    onSuccess: invalidate,
  });

  const deleteSubgroup = useMutation({
    mutationFn: async (subgroupId: string) => {
      const { error } = await supabase.from('team_effort_subgroups').delete().eq('id', subgroupId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Привязать человека к подкоманде или снять (subgroupId = null).
   * Снимает предыдущую запись membership для person_id (уникальный индекс).
   */
  const setPersonSubgroup = useMutation({
    mutationFn: async ({ personId, subgroupId }: { personId: string; subgroupId: string | null }) => {
      const { error: delErr } = await supabase
        .from('team_effort_subgroup_members')
        .delete()
        .eq('person_id', personId);
      if (delErr) throw delErr;
      if (subgroupId) {
        const { error: insErr } = await supabase.from('team_effort_subgroup_members').insert({
          subgroup_id: subgroupId,
          person_id: personId,
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: invalidate,
  });

  return {
    subgroups: query.data?.subgroups ?? [],
    membership: query.data?.membership ?? new Map<string, string>(),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    createSubgroup,
    deleteSubgroup,
    setPersonSubgroup,
  };
}
