import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserDisplayName } from '@/lib/authDisplayName';
import { normalizePersonRow, Person, ParsedPerson } from '@/lib/peopleDataManager';
import { useToast } from '@/hooks/use-toast';

function stripUndefinedInsert(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
}

function parsedPersonToInsertRow(p: ParsedPerson) {
  return {
    external_id: p.external_id?.trim() || null,
    full_name: p.full_name,
    email: p.email,
    hr_structure: p.hr_structure,
    unit: p.unit,
    team: p.team,
    position: p.position,
    leader: p.leader,
    hired_at: p.hired_at,
    terminated_at: p.terminated_at,
  };
}

// Fetch all people
export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      // `select('*')`: явный список с manual_* падает, если миграция people manual review ещё не накатана.
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('full_name');
      
      if (error) throw error;
      return (data ?? []).map((row) => normalizePersonRow(row as Record<string, unknown>));
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  });
}

// Get unique units and teams from people
export function usePeopleFilters(people: Person[] | undefined) {
  if (!people) return { units: [], teams: [] };
  
  const units = [...new Set(people.map(p => p.unit).filter(Boolean))] as string[];
  const teams = [...new Set(people.map(p => p.team).filter(Boolean))] as string[];
  
  return { units: units.sort(), teams: teams.sort() };
}

// Mutations for people CRUD
export function usePeopleMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createPerson = useMutation({
    mutationFn: async (person: Omit<Person, 'id' | 'created_at' | 'updated_at'>) => {
      const payload = stripUndefinedInsert(person as unknown as Record<string, unknown>);
      const { data, error } = await supabase.from('people').insert(payload).select().single();

      if (error) throw error;
      return normalizePersonRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Сотрудник добавлен' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  const updatePerson = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Person> & { id: string }) => {
      const payload = stripUndefinedInsert(updates as unknown as Record<string, unknown>);
      const { data, error } = await supabase
        .from('people')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return normalizePersonRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  /** Админ подтверждает запись, добавленную пользователем вручную. */
  const resolveManualPersonReview = useMutation({
    mutationFn: async (personId: string) => {
      const { id: uid, name } = await getCurrentUserDisplayName();
      const { data, error } = await supabase
        .from('people')
        .update({
          manual_review_status: 'resolved',
          manual_resolved_at: new Date().toISOString(),
          manual_resolved_by: uid,
          manual_resolved_by_name: name,
        })
        .eq('id', personId)
        .select()
        .single();

      if (error) throw error;
      return normalizePersonRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Запись отмечена как проверенная' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Не удалось обновить',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Сотрудник удалён' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  const importPeople = useMutation({
    mutationFn: async (people: ParsedPerson[]) => {
      /**
       * Импорт без upsert(..., onConflict: external_id): в части проектов в БД нет
       * UNIQUE(external_id), тогда Postgres отвечает «no unique or exclusion constraint matching ON CONFLICT».
       * Логика: вставка строк без HR-id; для строк с external_id — обновление по найденной записи или вставка.
       */
      const results: Person[] = [];
      const withoutExt = people.filter((p) => !p.external_id?.trim());
      const withExtRaw = people.filter((p) => p.external_id?.trim());
      const withExtByKey = new Map<string, ParsedPerson>();
      for (const p of withExtRaw) {
        withExtByKey.set(p.external_id!.trim(), p);
      }
      const withExtUnique = [...withExtByKey.values()];

      if (withoutExt.length > 0) {
        const rows = withoutExt.map(parsedPersonToInsertRow);
        const { data, error } = await supabase.from('people').insert(rows).select();
        if (error) throw error;
        if (data?.length) results.push(...(data as Person[]));
      }

      if (withExtUnique.length > 0) {
        const extIds = [...withExtByKey.keys()];
        const { data: existing, error: existingErr } = await supabase
          .from('people')
          .select('id, external_id')
          .in('external_id', extIds);
        if (existingErr) throw existingErr;

        const idByExt = new Map(
          (existing || []).map((r) => [r.external_id as string, r.id as string])
        );

        const toInsert = [];
        const toUpdate: { id: string; row: ReturnType<typeof parsedPersonToInsertRow> }[] = [];

        for (const p of withExtUnique) {
          const eid = p.external_id!.trim();
          const row = parsedPersonToInsertRow(p);
          const id = idByExt.get(eid);
          if (id) toUpdate.push({ id, row });
          else toInsert.push(row);
        }

        if (toInsert.length > 0) {
          const { data, error } = await supabase.from('people').insert(toInsert).select();
          if (error) throw error;
          if (data?.length) results.push(...(data as Person[]));
        }

        const UPDATE_CHUNK = 30;
        for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
          const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
          const settled = await Promise.all(
            chunk.map(({ id, row }) =>
              supabase.from('people').update(row).eq('id', id).select().single()
            )
          );
          for (const res of settled) {
            if (res.error) throw res.error;
            if (res.data) results.push(res.data as Person);
          }
        }
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Импорт завершён', description: `Импортировано ${data?.length || 0} сотрудников` });
    },
    onError: (error) => {
      toast({ title: 'Ошибка импорта', description: error.message, variant: 'destructive' });
    }
  });

  // Bulk update unit for all people matching a value
  const bulkUpdateUnit = useMutation({
    mutationFn: async ({ fromValue, toValue }: { fromValue: string; toValue: string }) => {
      const { error } = await supabase
        .from('people')
        .update({ unit: toValue })
        .eq('unit', fromValue);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Unit обновлён' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  // Bulk update team for all people matching a value
  const bulkUpdateTeam = useMutation({
    mutationFn: async ({ fromValue, toValue }: { fromValue: string; toValue: string }) => {
      const { error } = await supabase
        .from('people')
        .update({ team: toValue })
        .eq('team', fromValue);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: 'Team обновлён' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  return {
    createPerson,
    updatePerson,
    resolveManualPersonReview,
    deletePerson,
    importPeople,
    bulkUpdateUnit,
    bulkUpdateTeam,
  };
}
