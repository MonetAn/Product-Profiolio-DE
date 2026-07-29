import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildAllocationNotificationScopeOptions,
  normalizeAllocationNotificationPreferences,
  type AllocationNotificationPreferences,
  type AllocationNotificationScopeOption,
} from '@/lib/allocationNotificationPreferences';

const QUERY_KEY = ['allocation-notification-preferences'] as const;
const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST202', 'PGRST204', 'PGRST205']);

type PreferencesQueryData = {
  preferences: AllocationNotificationPreferences;
  scopeOptions: AllocationNotificationScopeOption[];
  isAvailable: boolean;
};

const DEFAULT_PREFERENCES: AllocationNotificationPreferences = {
  allScopes: true,
  selectedUnits: [],
  selectedTeamPairs: [],
};

// Таблица и RPC добавляются отдельной миграцией и пока не входят в
// сгенерированные Supabase-типы.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function isMissingRelationError(error: { code?: string } | null): boolean {
  return Boolean(error?.code && MISSING_RELATION_CODES.has(error.code));
}

export function useAllocationNotificationPreferences(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async (): Promise<PreferencesQueryData> => {
      const [preferencesResult, scopesResult] = await Promise.all([
        sb
          .from('allocation_notification_preferences')
          .select('all_scopes, selected_units, selected_team_pairs')
          .maybeSingle(),
        supabase
          .from('initiatives')
          .select('unit, team')
          .is('deleted_at', null),
      ]);

      if (scopesResult.error) throw scopesResult.error;
      const scopeOptions = buildAllocationNotificationScopeOptions(
        scopesResult.data ?? []
      );

      if (preferencesResult.error) {
        if (isMissingRelationError(preferencesResult.error)) {
          return {
            preferences: DEFAULT_PREFERENCES,
            scopeOptions,
            isAvailable: false,
          };
        }
        throw preferencesResult.error;
      }

      return {
        preferences: normalizeAllocationNotificationPreferences(
          preferencesResult.data
        ),
        scopeOptions,
        isAvailable: true,
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (preferences: AllocationNotificationPreferences) => {
      const { error } = await sb.rpc(
        'set_allocation_notification_preferences',
        {
          p_all_scopes: preferences.allScopes,
          p_selected_units: preferences.selectedUnits,
          p_selected_team_pairs: preferences.selectedTeamPairs,
        }
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
      }),
  });

  return {
    ...query,
    preferences: query.data?.preferences ?? DEFAULT_PREFERENCES,
    scopeOptions: query.data?.scopeOptions ?? [],
    isAvailable: query.data?.isAvailable ?? false,
    savePreferences: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
