import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { RawDataRow } from '@/lib/dataManager';
import {
  dashboardSensitiveRowKey,
  isUnitTeamSensitive,
  type SensitiveScopeRow,
} from '@/lib/sensitiveScopes';

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

async function fetchSensitiveScopesListFallback(): Promise<SensitiveScopeRow[]> {
  const rpc = await supabase.rpc('get_sensitive_scopes_for_client');
  if (!rpc.error) {
    return (rpc.data ?? []).map((r: { unit: string; team: string | null }) => ({ unit: r.unit, team: r.team }));
  }
  if (isMissingRpcError(rpc.error) || import.meta.env.DEV) {
    const sel = await supabase.from('sensitive_scopes').select('unit, team');
    if (!sel.error) {
      return (sel.data ?? []).map((r) => ({ unit: r.unit, team: r.team }));
    }
    if (!isMissingRpcError(rpc.error)) {
      throw sel.error;
    }
  }
  throw rpc.error;
}

/**
 * Множество пар (unit, team) из rawData, которые считаются sensitive по БД.
 * Основной путь — RPC sensitive_pairs_among_input (та же логика, что is_sensitive_unit_team).
 */
export function useSensitiveDashboardMask(rawData: RawDataRow[], needsMask: boolean) {
  const pairsPayload = useMemo((): { unit: string; team: string | null }[] | null => {
    if (!needsMask || rawData.length === 0) return null;
    const seen = new Set<string>();
    const arr: { unit: string; team: string | null }[] = [];
    for (const r of rawData) {
      const k = dashboardSensitiveRowKey(r.unit, r.team);
      if (seen.has(k)) continue;
      seen.add(k);
      arr.push({ unit: r.unit, team: r.team ?? null });
    }
    return arr;
  }, [rawData, needsMask]);

  const pairsKey = useMemo(() => (pairsPayload ? JSON.stringify(pairsPayload) : ''), [pairsPayload]);

  return useQuery({
    queryKey: ['sensitive_dashboard_mask', pairsKey],
    enabled: Boolean(needsMask && pairsPayload && pairsPayload.length > 0),
    queryFn: async (): Promise<Set<string>> => {
      const payload = pairsPayload as { unit: string; team: string | null }[];
      const rpc = await supabase.rpc('sensitive_pairs_among_input', {
        p_pairs: payload as unknown as Json,
      });
      if (!rpc.error) {
        const rows = (rpc.data ?? []) as { unit: string; team: string | null }[];
        return new Set(rows.map((row) => dashboardSensitiveRowKey(row.unit, row.team)));
      }
      if (isMissingRpcError(rpc.error) || import.meta.env.DEV) {
        const scopes = await fetchSensitiveScopesListFallback();
        return new Set(
          payload
            .filter((p) => isUnitTeamSensitive(p.unit, p.team, scopes))
            .map((p) => dashboardSensitiveRowKey(p.unit, p.team))
        );
      }
      throw rpc.error;
    },
    staleTime: 60_000,
  });
}
