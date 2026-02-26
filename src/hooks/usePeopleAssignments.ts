import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PersonAssignment, Person } from '@/lib/peopleDataManager';
import { useToast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';
import { AdminDataRow } from '@/lib/adminDataManager';

// Fetch all assignments
export function usePersonAssignments() {
  return useQuery({
    queryKey: ['person_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_initiative_assignments')
        .select('*');
      
      if (error) throw error;
      
      // Convert JSONB to typed object
      return (data || []).map(row => ({
        ...row,
        quarterly_effort: (row.quarterly_effort as Record<string, number>) || {},
        is_auto: row.is_auto ?? true
      })) as PersonAssignment[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  });
}

// Fetch assignments for a specific person
export function usePersonAssignmentsByPerson(personId: string | undefined) {
  return useQuery({
    queryKey: ['person_assignments', personId],
    queryFn: async () => {
      if (!personId) return [];
      
      const { data, error } = await supabase
        .from('person_initiative_assignments')
        .select('*')
        .eq('person_id', personId);
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        ...row,
        quarterly_effort: (row.quarterly_effort as Record<string, number>) || {},
        is_auto: row.is_auto ?? true
      })) as PersonAssignment[];
    },
    enabled: !!personId,
    staleTime: 1000 * 60,
  });
}

// Mutations for assignments CRUD
export function useAssignmentMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createAssignment = useMutation({
    mutationFn: async (assignment: Omit<PersonAssignment, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('person_initiative_assignments')
        .insert({
          person_id: assignment.person_id,
          initiative_id: assignment.initiative_id,
          quarterly_effort: assignment.quarterly_effort as unknown as Json,
          is_auto: assignment.is_auto ?? true
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person_assignments'] });
      toast({ title: 'Привязка добавлена' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ 
      id, 
      quarterly_effort, 
      is_auto 
    }: { 
      id: string; 
      quarterly_effort: Record<string, number>;
      is_auto?: boolean;
    }) => {
      const updateData: { quarterly_effort: Json; is_auto?: boolean } = {
        quarterly_effort: quarterly_effort as unknown as Json
      };
      if (is_auto !== undefined) {
        updateData.is_auto = is_auto;
      }
      
      const { data, error } = await supabase
        .from('person_initiative_assignments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person_assignments'] });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('person_initiative_assignments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person_assignments'] });
      toast({ title: 'Привязка удалена' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    }
  });

  // Sync assignments when initiative effortCoefficient changes
  // Creates/updates assignments for all team members
  const syncFromInitiative = useMutation({
    mutationFn: async ({
      initiative,
      people,
      quarter,
      effortValue
    }: {
      initiative: AdminDataRow;
      people: Person[];
      quarter: string;
      effortValue: number;
    }) => {
      // Find all people in the same unit/team as the initiative
      const teamMembers = people.filter(
        p => p.unit === initiative.unit && p.team === initiative.team && !p.terminated_at
      );
      
      if (teamMembers.length === 0) return { created: 0, updated: 0 };
      
      // Get existing assignments for this initiative
      const { data: existingAssignments, error: fetchError } = await supabase
        .from('person_initiative_assignments')
        .select('*')
        .eq('initiative_id', initiative.id);
      
      if (fetchError) throw fetchError;
      
      const existingByPerson = new Map(
        (existingAssignments || []).map(a => [a.person_id, a])
      );
      
      let created = 0;
      let updated = 0;
      
      for (const person of teamMembers) {
        const existing = existingByPerson.get(person.id);
        
        if (!existing) {
          // Create new assignment with this quarter's effort
          const { error } = await supabase
            .from('person_initiative_assignments')
            .insert({
              person_id: person.id,
              initiative_id: initiative.id,
              quarterly_effort: { [quarter]: effortValue } as unknown as Json,
              is_auto: true
            });
          
          if (error) throw error;
          created++;
        } else if (existing.is_auto) {
          // Only update if is_auto = true (not manually edited)
          const newEffort = {
            ...(existing.quarterly_effort as Record<string, number>),
            [quarter]: effortValue
          };
          
          const { error } = await supabase
            .from('person_initiative_assignments')
            .update({ quarterly_effort: newEffort as unknown as Json })
            .eq('id', existing.id);
          
          if (error) throw error;
          updated++;
        }
        // If is_auto = false, skip (manually edited)
      }
      
      return { created, updated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['person_assignments'] });
      if (result.created > 0 || result.updated > 0) {
        toast({ 
          title: 'Привязки обновлены',
          description: `Создано: ${result.created}, обновлено: ${result.updated}`
        });
      }
    },
    onError: (error) => {
      toast({ title: 'Ошибка синхронизации', description: error.message, variant: 'destructive' });
    }
  });

  return { 
    createAssignment, 
    updateAssignment, 
    deleteAssignment,
    syncFromInitiative
  };
}
