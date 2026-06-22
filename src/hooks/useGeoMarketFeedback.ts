import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GeoFeedbackStatus } from '@/lib/locationAllocationModel';

export type GeoMarketFeedbackEvent = {
  id: string;
  initiative_id: string;
  cluster_key: string;
  status: GeoFeedbackStatus;
  comment: string;
  author_email: string;
  created_at: string;
};

export const GEO_MARKET_FEEDBACK_QUERY_KEY = ['initiative_geo_market_feedback_events'] as const;

export function useGeoMarketFeedbackEvents() {
  return useQuery({
    queryKey: GEO_MARKET_FEEDBACK_QUERY_KEY,
    queryFn: async (): Promise<GeoMarketFeedbackEvent[]> => {
      const { data, error } = await supabase
        .from('initiative_geo_market_feedback_events')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GeoMarketFeedbackEvent[];
    },
  });
}

/** Последний статус по паре initiative + cluster (cluster_key в БД). */
export function buildLatestFeedbackMap(
  events: GeoMarketFeedbackEvent[]
): Map<string, GeoMarketFeedbackEvent> {
  const out = new Map<string, GeoMarketFeedbackEvent>();
  for (const ev of events) {
    const key = `${ev.initiative_id}\u0000${ev.cluster_key}`;
    if (!out.has(key)) out.set(key, ev);
  }
  return out;
}

export function feedbackHistoryForCell(
  events: GeoMarketFeedbackEvent[],
  initiativeId: string,
  clusterKey: string
): GeoMarketFeedbackEvent[] {
  return events.filter(
    (e) => e.initiative_id === initiativeId && e.cluster_key === clusterKey
  );
}

export function useGeoMarketFeedbackMutations() {
  const queryClient = useQueryClient();

  const insert = useMutation({
    mutationFn: async (payload: {
      initiative_id: string;
      cluster_key: string;
      status: GeoFeedbackStatus;
      comment: string;
      author_email: string;
    }) => {
      const { data, error } = await supabase
        .from('initiative_geo_market_feedback_events')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as GeoMarketFeedbackEvent;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GEO_MARKET_FEEDBACK_QUERY_KEY });
    },
  });

  return { insert };
}
