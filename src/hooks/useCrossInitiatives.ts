import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  equalCostShares,
  membersForInitiative,
  parseCrossInitiativesBundle,
  type CrossInitiativeMemberRow,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';

export const CROSS_INITIATIVES_QUERY_KEY = ['cross_initiatives_bundle'] as const;

const CROSS_RLS_HINT =
  'Нет прав на кросс-инициативы: нужен ранний доступ или роль admin, миграция cross_initiatives_admin_access, ' +
  'перелогин (sessionStorage app_access).';

function throwCrossInitiativeError(err: { code?: string; message?: string }): never {
  const msg = err.message ?? '';
  if (
    err.code === '42501' ||
    /row-level security/i.test(msg) ||
    /early_access_required/i.test(msg)
  ) {
    throw new Error(CROSS_RLS_HINT);
  }
  throw err;
}

async function fetchCrossInitiativesBundle(): Promise<CrossInitiativesBundle> {
  const { data, error } = await supabase.rpc('get_cross_initiatives_bundle');
  if (error) throw error;
  return parseCrossInitiativesBundle(data);
}

export function useCrossInitiatives(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CROSS_INITIATIVES_QUERY_KEY,
    queryFn: fetchCrossInitiativesBundle,
    staleTime: 1000 * 30,
    enabled: options?.enabled !== false,
  });
}

async function rebalanceInitiativeShares(initiativeId: string): Promise<void> {
  const { data: rows, error: fetchErr } = await supabase
    .from('cross_initiative_members')
    .select('id, cross_initiative_id')
    .eq('initiative_id', initiativeId);
  if (fetchErr) throw fetchErr;
  const list = rows ?? [];
  if (list.length === 0) return;
  const shares = equalCostShares(list.length);
  for (let i = 0; i < list.length; i++) {
    const { error } = await supabase
      .from('cross_initiative_members')
      .update({ cost_share_pct: shares[i] })
      .eq('id', list[i].id);
    if (error) throw error;
  }
}

export function useCrossInitiativeMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: CROSS_INITIATIVES_QUERY_KEY });

  const createCrossWithMembers = useMutation({
    mutationFn: async ({
      name,
      initiativeIds,
      createdBy,
    }: {
      name: string;
      initiativeIds: string[];
      createdBy?: string | null;
    }) => {
      const { data: crossId, error: rpcErr } = await supabase.rpc(
        'create_cross_initiative_with_members',
        {
          p_name: name.trim(),
          p_initiative_ids: initiativeIds,
          p_created_by: createdBy ?? null,
        }
      );
      if (!rpcErr && crossId) {
        return crossId as string;
      }

      // Fallback, если RPC ещё не задеплоена (старый прод)
      if (rpcErr) {
        const missingRpc =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /does not exist/i.test(rpcErr.message ?? '');
        if (!missingRpc) throwCrossInitiativeError(rpcErr);
      }

      const { data: cross, error: crossErr } = await supabase
        .from('cross_initiatives')
        .insert({ name: name.trim(), created_by: createdBy ?? null })
        .select('id')
        .single();
      if (crossErr) throwCrossInitiativeError(crossErr);

      for (const initiativeId of initiativeIds) {
        const { error: memErr } = await supabase.from('cross_initiative_members').insert({
          cross_initiative_id: cross.id,
          initiative_id: initiativeId,
          cost_share_pct: 100,
        });
        if (memErr) throwCrossInitiativeError(memErr);
        await rebalanceInitiativeShares(initiativeId);
      }
      return cross.id as string;
    },
    onSuccess: invalidate,
  });

  const addToCross = useMutation({
    mutationFn: async ({
      crossInitiativeId,
      initiativeId,
    }: {
      crossInitiativeId: string;
      initiativeId: string;
    }) => {
      const { data: existing, error: existErr } = await supabase
        .from('cross_initiative_members')
        .select('id')
        .eq('cross_initiative_id', crossInitiativeId)
        .eq('initiative_id', initiativeId)
        .maybeSingle();
      if (existErr) throw existErr;
      if (existing) return;

      const { error } = await supabase.from('cross_initiative_members').insert({
        cross_initiative_id: crossInitiativeId,
        initiative_id: initiativeId,
        cost_share_pct: 100,
      });
      if (error) throw error;
      await rebalanceInitiativeShares(initiativeId);
    },
    onSuccess: invalidate,
  });

  const removeFromCross = useMutation({
    mutationFn: async ({
      crossInitiativeId,
      initiativeId,
    }: {
      crossInitiativeId: string;
      initiativeId: string;
    }) => {
      const { error } = await supabase
        .from('cross_initiative_members')
        .delete()
        .eq('cross_initiative_id', crossInitiativeId)
        .eq('initiative_id', initiativeId);
      if (error) throw error;
      await rebalanceInitiativeShares(initiativeId);

      const { count, error: countErr } = await supabase
        .from('cross_initiative_members')
        .select('id', { count: 'exact', head: true })
        .eq('cross_initiative_id', crossInitiativeId);
      if (countErr) throw countErr;
      if ((count ?? 0) === 0) {
        const { error: delErr } = await supabase
          .from('cross_initiatives')
          .delete()
          .eq('id', crossInitiativeId);
        if (delErr) throw delErr;
      }
    },
    onSuccess: invalidate,
  });

  const updateCrossName = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('cross_initiatives')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateCrossDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase
        .from('cross_initiatives')
        .update({
          description: description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMemberShares = useMutation({
    mutationFn: async (updates: { id: string; cost_share_pct: number }[]) => {
      const total = updates.reduce((s, u) => s + u.cost_share_pct, 0);
      if (Math.abs(total - 100) > 0.05) {
        throw new Error('Сумма долей должна быть 100%');
      }
      for (const u of updates) {
        const { error } = await supabase
          .from('cross_initiative_members')
          .update({ cost_share_pct: u.cost_share_pct })
          .eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return {
    createCrossWithMembers,
    addToCross,
    removeFromCross,
    updateCrossName,
    updateCrossDescription,
    updateMemberShares,
  };
}

export function getCrossName(
  crossId: string,
  bundle: CrossInitiativesBundle | undefined
): string {
  return bundle?.crossInitiatives.find((c) => c.id === crossId)?.name ?? 'Кросс-инициатива';
}

export function otherCrossMemberships(
  initiativeId: string,
  members: CrossInitiativeMemberRow[],
  excludeCrossId?: string
): CrossInitiativeMemberRow[] {
  return membersForInitiative(initiativeId, members).filter(
    (m) => m.cross_initiative_id !== excludeCrossId
  );
}
