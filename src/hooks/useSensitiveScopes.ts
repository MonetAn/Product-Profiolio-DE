import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SensitiveScopeRow } from '@/lib/sensitiveScopes';

export function useSensitiveScopes(enabled: boolean) {
  return useQuery({
    queryKey: ['sensitive_scopes'],
    enabled,
    queryFn: async (): Promise<SensitiveScopeRow[]> => {
      const { data, error } = await supabase.from('sensitive_scopes').select('unit, team');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        unit: r.unit,
        team: r.team,
      }));
    },
    staleTime: 60_000,
  });
}
