import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Person, ParsedPerson } from '@/lib/peopleDataManager';
import { useToast } from '@/hooks/use-toast';

// Fetch all people
export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('full_name');
      
      if (error) throw error;
      return data as Person[];
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
      const { data, error } = await supabase
        .from('people')
        .insert(person)
        .select()
        .single();
      
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('people')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
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
      // Convert ParsedPerson to database format
      const dbPeople = people.map(p => ({
        external_id: p.external_id,
        full_name: p.full_name,
        email: p.email,
        hr_structure: p.hr_structure,
        unit: p.unit,
        team: p.team,
        position: p.position,
        leader: p.leader,
        hired_at: p.hired_at,
        terminated_at: p.terminated_at,
      }));

      const { data, error } = await supabase
        .from('people')
        .upsert(dbPeople, { 
          onConflict: 'external_id',
          ignoreDuplicates: false 
        })
        .select();
      
      if (error) throw error;
      return data;
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

  return { createPerson, updatePerson, deletePerson, importPeople, bulkUpdateUnit, bulkUpdateTeam };
}
