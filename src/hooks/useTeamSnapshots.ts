import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Person } from '@/lib/peopleDataManager';

// ===== TYPES =====
export interface TeamSnapshot {
  id: string;
  unit: string;
  team: string;
  quarter: string;
  person_ids: string[];
  source: string;
  imported_at: string | null;
  created_by: string | null;
  roster_confirmed_at: string | null;
  roster_confirmed_by: string | null;
  roster_confirmed_by_name: string | null;
}

/** Ответ сохранения состава: строка из БД + метаданные для UI (если в БД нет колонок подтверждения). */
export interface RosterUpsertResult {
  snapshot: TeamSnapshot;
  displayAt: string;
  displayName: string;
}

/** Supabase/Postgres иногда отдаёт null вместо [] — без этого падает `.includes` в расчёте состава. */
export function normalizeSnapshotPersonIds(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

type AuthUserLike = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};

async function resolveRosterConfirmerDisplayName(user: AuthUserLike | null): Promise<string> {
  if (!user) return 'Пользователь';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const fromProfile = profile?.full_name?.trim();
  if (fromProfile) return fromProfile;
  const meta = user.user_metadata;
  return (
    meta?.full_name ||
    meta?.name ||
    user.email?.split('@')[0]?.trim() ||
    'Пользователь'
  );
}

function rowToTeamSnapshot(row: Record<string, unknown>): TeamSnapshot {
  return {
    id: String(row.id),
    unit: String(row.unit),
    team: String(row.team),
    quarter: String(row.quarter),
    person_ids: normalizeSnapshotPersonIds(row.person_ids),
    source: String(row.source ?? ''),
    imported_at: (row.imported_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    roster_confirmed_at: (row.roster_confirmed_at as string | null) ?? null,
    roster_confirmed_by: (row.roster_confirmed_by as string | null) ?? null,
    roster_confirmed_by_name: (row.roster_confirmed_by_name as string | null) ?? null,
  };
}

function isRosterMetaColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('roster_confirmed') ||
    (m.includes('schema cache') && m.includes('team_quarter_snapshots'))
  );
}

export interface SnapshotStatus {
  type: 'snapshot' | 'carried_forward' | 'current_staff';
  sourceQuarter?: string;  // For carried_forward, which quarter it came from
  importedAt?: string;     // For snapshot, when it was imported
}

// ===== HELPER FUNCTIONS =====

/**
 * Get current quarter in format "YYYY-QN"
 */
export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Compare two quarter strings
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareQuarters(a: string, b: string): number {
  const parseQ = (q: string) => {
    const match = q.match(/^(\d{4})-Q(\d)$/);
    if (!match) return { year: 0, quarter: 0 };
    return { year: parseInt(match[1]), quarter: parseInt(match[2]) };
  };
  
  const aQ = parseQ(a);
  const bQ = parseQ(b);
  
  if (aQ.year !== bQ.year) return aQ.year - bQ.year;
  return aQ.quarter - bQ.quarter;
}

/**
 * Get effective team members for a given quarter using snapshot logic:
 * 1. If snapshot exists for this quarter → use it
 * 2. If no snapshot and quarter <= current → find nearest previous snapshot
 * 3. If no snapshot and quarter > current → use current active staff
 */
export function getEffectiveTeamMembers(
  unit: string,
  team: string,
  quarter: string,
  snapshots: TeamSnapshot[],
  allPeople: Person[],
  allQuarters: string[]
): { people: Person[]; status: SnapshotStatus } {
  // Filter snapshots for this unit/team
  const teamSnapshots = snapshots.filter(s => s.unit === unit && s.team === team);
  
  // 1. Check for exact match
  const exactSnapshot = teamSnapshots.find(s => s.quarter === quarter);
  if (exactSnapshot) {
    const ids = normalizeSnapshotPersonIds(exactSnapshot.person_ids);
    const people = allPeople.filter(p => ids.includes(p.id));
    return {
      people,
      status: {
        type: 'snapshot',
        importedAt: exactSnapshot.imported_at || undefined
      }
    };
  }
  
  // 2. Determine if this is a past/current or future quarter
  const currentQuarter = getCurrentQuarter();
  const isFuture = compareQuarters(quarter, currentQuarter) > 0;
  
  if (!isFuture) {
    // Past or current quarter: look for nearest previous snapshot
    const sortedQuarters = [...allQuarters].sort(compareQuarters);
    const quarterIndex = sortedQuarters.indexOf(quarter);
    
    for (let i = quarterIndex - 1; i >= 0; i--) {
      const prevSnapshot = teamSnapshots.find(s => s.quarter === sortedQuarters[i]);
      if (prevSnapshot) {
        const prevIds = normalizeSnapshotPersonIds(prevSnapshot.person_ids);
        const people = allPeople.filter(p => prevIds.includes(p.id));
        return {
          people,
          status: {
            type: 'carried_forward',
            sourceQuarter: sortedQuarters[i]
          }
        };
      }
    }
  }
  
  // 3. Future quarter or no previous snapshots → use current active staff
  const activeStaff = allPeople.filter(p => 
    p.unit === unit && 
    p.team === team && 
    !p.terminated_at
  );
  
  return {
    people: activeStaff,
    status: { type: 'current_staff' }
  };
}

/**
 * Get all effective members across multiple quarters for a unit/team
 * Returns a map of quarter → person IDs
 */
export function getEffectiveTeamMembersAllQuarters(
  unit: string,
  team: string,
  quarters: string[],
  snapshots: TeamSnapshot[],
  allPeople: Person[]
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  
  for (const quarter of quarters) {
    const { people } = getEffectiveTeamMembers(unit, team, quarter, snapshots, allPeople, quarters);
    result.set(quarter, new Set(people.map(p => p.id)));
  }
  
  return result;
}

/**
 * Check if a person is active in a given quarter
 */
export function isPersonActiveInQuarter(
  personId: string,
  unit: string,
  team: string,
  quarter: string,
  membershipMap: Map<string, Set<string>>
): boolean {
  const quarterMembers = membershipMap.get(quarter);
  return quarterMembers?.has(personId) ?? false;
}

// ===== HOOKS =====

/**
 * Fetch all snapshots for given units/teams
 */
export function useTeamSnapshots(units: string[], teams: string[]) {
  return useQuery({
    queryKey: ['team-snapshots', units, teams],
    queryFn: async () => {
      if (units.length === 0) return [];
      
      let query = supabase
        .from('team_quarter_snapshots')
        .select('*');
      
      if (units.length > 0) {
        query = query.in('unit', units);
      }
      
      const { data, error } = await query.order('quarter');
      
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          ...row,
          person_ids: normalizeSnapshotPersonIds(r.person_ids),
          roster_confirmed_at: (r.roster_confirmed_at as string | null) ?? null,
          roster_confirmed_by: (r.roster_confirmed_by as string | null) ?? null,
          roster_confirmed_by_name: (r.roster_confirmed_by_name as string | null) ?? null,
        } as TeamSnapshot;
      });
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    enabled: units.length > 0
  });
}

/**
 * Get snapshot status for each quarter (for UI indicators)
 */
export function useSnapshotStatuses(
  unit: string,
  team: string,
  quarters: string[],
  snapshots: TeamSnapshot[],
  allPeople: Person[]
): Map<string, SnapshotStatus> {
  const statusMap = new Map<string, SnapshotStatus>();
  
  for (const quarter of quarters) {
    const { status } = getEffectiveTeamMembers(unit, team, quarter, snapshots, allPeople, quarters);
    statusMap.set(quarter, status);
  }
  
  return statusMap;
}

/**
 * Mutations for snapshots
 */
export function useSnapshotMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createSnapshot = useMutation({
    mutationFn: async (
      snapshot: Omit<
        TeamSnapshot,
        'id' | 'imported_at' | 'created_by' | 'roster_confirmed_at' | 'roster_confirmed_by' | 'roster_confirmed_by_name'
      >
    ) => {
      const { data, error } = await supabase
        .from('team_quarter_snapshots')
        .upsert(
          {
            unit: snapshot.unit,
            team: snapshot.team,
            quarter: snapshot.quarter,
            person_ids: snapshot.person_ids,
            source: snapshot.source,
          },
          {
            onConflict: 'unit,team,quarter',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-snapshots'] });
    },
    onError: (error) => {
      toast({ title: 'Ошибка создания снимка', description: error.message, variant: 'destructive' });
    }
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_quarter_snapshots')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-snapshots'] });
      toast({ title: 'Снимок удалён' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  const upsertRosterSnapshot = useMutation({
    mutationFn: async (args: {
      unit: string;
      team: string;
      quarter: string;
      person_ids: string[];
    }): Promise<RosterUpsertResult> => {
      const { unit, team, quarter, person_ids } = args;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      const roster_confirmed_at = new Date().toISOString();
      const roster_confirmed_by = user?.id ?? null;
      const roster_confirmed_by_name = await resolveRosterConfirmerDisplayName(user);

      const baseRow = {
        unit,
        team,
        quarter,
        person_ids,
        source: 'quick_flow' as const,
      };
      const withRosterMeta = {
        ...baseRow,
        roster_confirmed_at,
        roster_confirmed_by,
        roster_confirmed_by_name,
      };

      let { data, error } = await supabase
        .from('team_quarter_snapshots')
        .upsert(withRosterMeta, { onConflict: 'unit,team,quarter' })
        .select()
        .single();

      if (error && isRosterMetaColumnError(error.message)) {
        ({ data, error } = await supabase
          .from('team_quarter_snapshots')
          .upsert(baseRow, { onConflict: 'unit,team,quarter' })
          .select()
          .single());
      }

      if (error) throw error;
      if (!data) throw new Error('Пустой ответ при сохранении состава');

      const snapshot = rowToTeamSnapshot(data as Record<string, unknown>);
      return {
        snapshot,
        displayAt: roster_confirmed_at,
        displayName: roster_confirmed_by_name,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-snapshots'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Не удалось сохранить состав', description: error.message, variant: 'destructive' });
    },
  });

  return { createSnapshot, deleteSnapshot, upsertRosterSnapshot };
}
