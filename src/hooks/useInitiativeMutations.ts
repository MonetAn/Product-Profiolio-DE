import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRef, useCallback, useState, useEffect } from 'react';
import { AdminDataRow, AdminQuarterData, createEmptyQuarterData } from '@/lib/adminDataManager';
import { quarterlyDataToJson } from './useInitiatives';
import { useToast } from '@/hooks/use-toast';
import { Person } from '@/lib/peopleDataManager';
import { Json } from '@/integrations/supabase/types';

// Field to DB column mapping
const FIELD_TO_COLUMN: Record<string, string> = {
  unit: 'unit',
  team: 'team',
  initiative: 'initiative',
  initiativeType: 'initiative_type',
  stakeholdersList: 'stakeholders_list',
  description: 'description',
  documentationLink: 'documentation_link',
  stakeholders: 'stakeholders',
  quarterlyData: 'quarterly_data',
};

export type SyncStatus = 'synced' | 'saving' | 'error' | 'offline';

export function useInitiativeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastError, setLastError] = useState<string | null>(null);

  // Track pending changes count
  useEffect(() => {
    setPendingCount(debounceTimers.current.size);
  }, [debounceTimers.current.size]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ 
      id, 
      field, 
      value 
    }: { 
      id: string; 
      field: string; 
      value: unknown;
    }) => {
      const dbColumn = FIELD_TO_COLUMN[field] || field;
      const { error } = await supabase
        .from('initiatives')
        .update({ [dbColumn]: value })
        .eq('id', id);
      
      if (error) throw error;
    },
    onMutate: async (variables) => {
      setSyncStatus('saving');
      setLastError(null);
      
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['initiatives'] });
      const previous = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
      
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => 
        (old || []).map(row => 
          row.id === variables.id 
            ? { ...row, [variables.field]: variables.value }
            : row
        )
      );
      
      return { previous };
    },
    onError: (err, variables, context) => {
      console.error('Update failed:', err);
      setSyncStatus('error');
      setLastError(err instanceof Error ? err.message : 'Ошибка сохранения');
      
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['initiatives'], context.previous);
      }
      
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      if (debounceTimers.current.size === 0) {
        setSyncStatus('synced');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Omit<AdminDataRow, 'id'>) => {
      const { data: created, error } = await supabase
        .from('initiatives')
        .insert({
          unit: data.unit,
          team: data.team,
          initiative: data.initiative,
          initiative_type: data.initiativeType || null,
          stakeholders_list: data.stakeholdersList,
          description: data.description,
          documentation_link: data.documentationLink,
          stakeholders: data.stakeholders,
          quarterly_data: quarterlyDataToJson(data.quarterlyData),
        })
        .select()
        .single();
      
      if (error) throw error;
      return created;
    },
    onMutate: async () => {
      setSyncStatus('saving');
    },
    onError: (err) => {
      console.error('Create failed:', err);
      setSyncStatus('error');
      toast({
        title: 'Ошибка создания',
        description: 'Не удалось создать инициативу.',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      setSyncStatus('synced');
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('initiatives')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onMutate: async (id) => {
      setSyncStatus('saving');
      
      await queryClient.cancelQueries({ queryKey: ['initiatives'] });
      const previous = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
      
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => 
        (old || []).filter(row => row.id !== id)
      );
      
      return { previous };
    },
    onError: (err, id, context) => {
      console.error('Delete failed:', err);
      setSyncStatus('error');
      
      if (context?.previous) {
        queryClient.setQueryData(['initiatives'], context.previous);
      }
      
      toast({
        title: 'Ошибка удаления',
        description: 'Не удалось удалить инициативу.',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      setSyncStatus('synced');
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    }
  });

  // Debounced update for text fields
  const debouncedUpdate = useCallback((
    id: string, 
    field: string, 
    value: unknown, 
    delay = 1000
  ) => {
    const key = `${id}-${field}`;
    
    // Cancel previous timer
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    
    // Immediate optimistic update in cache
    queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => 
      (old || []).map(row => 
        row.id === id 
          ? { ...row, [field]: value }
          : row
      )
    );
    
    setSyncStatus('saving');
    setPendingCount(debounceTimers.current.size + 1);
    
    // Set new timer
    const timer = setTimeout(() => {
      updateMutation.mutate({ id, field, value });
      debounceTimers.current.delete(key);
      setPendingCount(debounceTimers.current.size);
    }, delay);
    
    debounceTimers.current.set(key, timer);
  }, [updateMutation, queryClient]);

  // Sync assignments when effortCoefficient changes
  const syncAssignments = useCallback(async (
    initiative: AdminDataRow,
    quarter: string,
    effortValue: number
  ) => {
    try {
      // Get all people matching initiative's unit/team
      const { data: people, error: peopleError } = await supabase
        .from('people')
        .select('*')
        .eq('unit', initiative.unit)
        .eq('team', initiative.team)
        .is('terminated_at', null);
      
      if (peopleError) throw peopleError;
      if (!people || people.length === 0) return;

      // Get existing assignments for this initiative
      const { data: existingAssignments, error: assignError } = await supabase
        .from('person_initiative_assignments')
        .select('*')
        .eq('initiative_id', initiative.id);
      
      if (assignError) throw assignError;

      const existingByPerson = new Map(
        (existingAssignments || []).map(a => [a.person_id, a])
      );

      let created = 0;
      let updated = 0;

      for (const person of people as Person[]) {
        const existing = existingByPerson.get(person.id);
        
        if (!existing) {
          // Create new assignment
          await supabase
            .from('person_initiative_assignments')
            .insert({
              person_id: person.id,
              initiative_id: initiative.id,
              quarterly_effort: { [quarter]: effortValue } as unknown as Json,
              is_auto: true
            });
          created++;
        } else if (existing.is_auto) {
          // Only update if is_auto = true
          const newEffort = {
            ...(existing.quarterly_effort as Record<string, number>),
            [quarter]: effortValue
          };
          await supabase
            .from('person_initiative_assignments')
            .update({ quarterly_effort: newEffort as unknown as Json })
            .eq('id', existing.id);
          updated++;
        }
      }

      if (created > 0 || updated > 0) {
        queryClient.invalidateQueries({ queryKey: ['person_assignments'] });
        toast({ 
          title: 'Привязки обновлены',
          description: `Создано: ${created}, обновлено: ${updated}`
        });
      }
    } catch (err) {
      console.error('Sync assignments error:', err);
    }
  }, [queryClient, toast]);

  // Update quarterly data (merges with existing)
  const updateQuarterData = useCallback((
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean
  ) => {
    const key = `${id}-quarterly-${quarter}-${field}`;
    
    // Cancel previous timer
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    
    // Get current data
    const currentData = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
    const currentRow = currentData?.find(r => r.id === id);
    
    if (!currentRow) return;
    
    const updatedQuarterlyData = {
      ...currentRow.quarterlyData,
      [quarter]: {
        ...(currentRow.quarterlyData[quarter] || createEmptyQuarterData()),
        [field]: value
      }
    };
    
    // Immediate optimistic update
    queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => 
      (old || []).map(row => 
        row.id === id 
          ? { ...row, quarterlyData: updatedQuarterlyData }
          : row
      )
    );
    
    setSyncStatus('saving');
    
    // Debounce based on field type
    const delay = typeof value === 'boolean' ? 0 : 
                  typeof value === 'number' ? 500 : 1000;
    
    const timer = setTimeout(async () => {
      updateMutation.mutate({ 
        id, 
        field: 'quarterlyData', 
        value: quarterlyDataToJson(updatedQuarterlyData) 
      });
      
      // If effortCoefficient changed, sync people assignments
      if (field === 'effortCoefficient' && typeof value === 'number' && value > 0) {
        const updatedRow = { ...currentRow, quarterlyData: updatedQuarterlyData };
        await syncAssignments(updatedRow, quarter, value);
      }
      
      debounceTimers.current.delete(key);
      setPendingCount(debounceTimers.current.size);
    }, delay);
    
    debounceTimers.current.set(key, timer);
    setPendingCount(debounceTimers.current.size);
  }, [updateMutation, queryClient, syncAssignments]);

  // Immediate update (no debounce)
  const immediateUpdate = useCallback((
    id: string,
    field: string,
    value: unknown
  ) => {
    updateMutation.mutate({ id, field, value });
  }, [updateMutation]);

  // Flush all pending changes immediately
  const flushPendingChanges = useCallback(() => {
    debounceTimers.current.forEach((timer, key) => {
      clearTimeout(timer);
      debounceTimers.current.delete(key);
    });
    setPendingCount(0);
  }, []);

  // Retry last failed operation
  const retry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    setSyncStatus('synced');
    setLastError(null);
  }, [queryClient]);

  return {
    // Update methods
    updateInitiative: debouncedUpdate,
    updateQuarterData,
    immediateUpdate,
    
    // CRUD operations
    createInitiative: createMutation.mutateAsync,
    deleteInitiative: deleteMutation.mutateAsync,
    
    // Status
    syncStatus,
    isSaving: updateMutation.isPending || createMutation.isPending || deleteMutation.isPending,
    pendingChanges: pendingCount,
    lastError,
    
    // Actions
    flushPendingChanges,
    retry,
  };
}
