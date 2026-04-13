import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MarketCountryRow = Database['public']['Tables']['market_countries']['Row'];
export type MarketCountryInsert = Database['public']['Tables']['market_countries']['Insert'];
export type MarketCountryUpdate = Database['public']['Tables']['market_countries']['Update'];

export const MARKET_COUNTRIES_QUERY_KEY = ['market_countries'] as const;

export function useMarketCountries(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: [...MARKET_COUNTRIES_QUERY_KEY, includeInactive] as const,
    queryFn: async (): Promise<MarketCountryRow[]> => {
      let q = supabase.from('market_countries').select('*').order('sort_order', { ascending: true });
      if (!includeInactive) {
        q = q.eq('is_active', true);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarketCountryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: MARKET_COUNTRIES_QUERY_KEY });
  };

  const insert = useMutation({
    mutationFn: async (row: MarketCountryInsert) => {
      const { data, error } = await supabase.from('market_countries').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MarketCountryUpdate }) => {
      const { data, error } = await supabase.from('market_countries').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return { insert, update };
}

/** id страны → cluster_key (только активные в списке rows). */
export function buildCountryIdToClusterMap(rows: MarketCountryRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.is_active) m.set(r.id, r.cluster_key);
  }
  return m;
}
