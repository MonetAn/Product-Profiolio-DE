import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRef, useCallback, useState, useEffect } from 'react';
import {
  AdminDataRow,
  AdminQuarterData,
  confirmFinanceForAllQuartersInData,
  createEmptyQuarterData,
  type GeoCostSplit,
} from '@/lib/adminDataManager';
import { quarterlyDataToJson, quarterlyJsonToAdminRecord } from './useInitiatives';
import { useToast } from '@/hooks/use-toast';
import { Person } from '@/lib/peopleDataManager';
import { Json } from '@/integrations/supabase/types';

const FIELD_TO_COLUMN: Record<string, string> = {
  unit: 'unit',
  team: 'team',
  initiative: 'initiative',
  initiativeType: 'initiative_type',
  stakeholdersList: 'stakeholders_list',
  description: 'description',
  documentationLink: 'documentation_link',
  stakeholders: 'stakeholders',
  isTimelineStub: 'is_timeline_stub',
  quarterlyData: 'quarterly_data',
};

function applyPatchToAdminRow(row: AdminDataRow, patch: Record<string, unknown>): AdminDataRow {
  let next = { ...row };
  const p = patch;
  if (p.unit !== undefined) next.unit = p.unit as string;
  if (p.team !== undefined) next.team = p.team as string;
  if (p.initiative !== undefined) next.initiative = p.initiative as string;
  if (p.initiative_type !== undefined) next.initiativeType = (p.initiative_type as string) || '';
  if (p.stakeholders_list !== undefined) next.stakeholdersList = p.stakeholders_list as string[];
  if (p.description !== undefined) next.description = p.description as string;
  if (p.documentation_link !== undefined) next.documentationLink = p.documentation_link as string;
  if (p.stakeholders !== undefined) next.stakeholders = p.stakeholders as string;
  if (p.is_timeline_stub !== undefined) next.isTimelineStub = p.is_timeline_stub as boolean;
  if (p.quarterly_data !== undefined) {
    next.quarterlyData = quarterlyJsonToAdminRecord(p.quarterly_data);
  }
  return next;
}

export type SyncStatus = 'synced' | 'saving' | 'error' | 'offline';

export function useInitiativeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  /** Сколько ближайших onSettled пропустить с отдельным invalidate — одна инвалидация в конце пакета (Quick Flow). */
  const bulkInitiativeInvalidateSkipsRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setPendingCount(debounceTimers.current.size);
  }, [debounceTimers.current.size]);

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('initiatives').update(vars.patch).eq('id', vars.id);
      if (error) throw error;
    },
    onMutate: async (variables) => {
      setSyncStatus('saving');
      setLastError(null);
      await queryClient.cancelQueries({ queryKey: ['initiatives'] });
      const previous = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) =>
          row.id === variables.id ? applyPatchToAdminRow(row, variables.patch) : row
        );
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      const details =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : err instanceof Error
            ? err.message
            : String(err);
      console.error('Update failed:', variables.id, err);
      setSyncStatus('error');
      setLastError(details);
      if (context?.previous) {
        queryClient.setQueryData(['initiatives'], context.previous);
      }
      toast({
        title: 'Ошибка сохранения',
        description: details || 'Не удалось сохранить изменения. Попробуйте ещё раз.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      if (debounceTimers.current.size === 0) {
        setSyncStatus('synced');
      }
    },
    onSettled: () => {
      if (bulkInitiativeInvalidateSkipsRef.current > 0) {
        bulkInitiativeInvalidateSkipsRef.current -= 1;
        if (bulkInitiativeInvalidateSkipsRef.current === 0) {
          queryClient.invalidateQueries({ queryKey: ['initiatives'] });
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<AdminDataRow, 'id'>) => {
      const qd = confirmFinanceForAllQuartersInData(data.quarterlyData);
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
          is_timeline_stub: data.isTimelineStub ?? false,
          quarterly_data: quarterlyDataToJson(qd),
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
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      setSyncStatus('synced');
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('initiatives').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      setSyncStatus('saving');
      await queryClient.cancelQueries({ queryKey: ['initiatives'] });
      const previous = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.filter((row) => row.id !== id);
      });
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
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      setSyncStatus('synced');
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    },
  });

  const debouncedUpdate = useCallback(
    (id: string, field: string, value: unknown, delay = 1000) => {
      const key = `${id}-${field}`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const dbColumn = FIELD_TO_COLUMN[field] || field;

      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id !== id ? row : { ...row, [field]: value }));
      });

      setSyncStatus('saving');
      setPendingCount(debounceTimers.current.size + 1);

      const timer = setTimeout(() => {
        const latest = queryClient.getQueryData<AdminDataRow[]>(['initiatives'])?.find((r) => r.id === id);
        if (!latest) {
          debounceTimers.current.delete(key);
          setPendingCount(debounceTimers.current.size);
          return;
        }
        updateMutation.mutate({
          id,
          patch: { [dbColumn]: value },
        });
        debounceTimers.current.delete(key);
        setPendingCount(debounceTimers.current.size);
      }, delay);

      debounceTimers.current.set(key, timer);
      setPendingCount(debounceTimers.current.size);
    },
    [updateMutation, queryClient]
  );

  const syncAssignments = useCallback(
    async (initiative: AdminDataRow, quarter: string, effortValue: number) => {
      try {
        const { data: people, error: peopleError } = await supabase
          .from('people')
          .select('*')
          .eq('unit', initiative.unit)
          .eq('team', initiative.team)
          .is('terminated_at', null);

        if (peopleError) throw peopleError;
        if (!people || people.length === 0) return;

        const { data: existingAssignments, error: assignError } = await supabase
          .from('person_initiative_assignments')
          .select('*')
          .eq('initiative_id', initiative.id);

        if (assignError) throw assignError;

        const existingByPerson = new Map((existingAssignments || []).map((a) => [a.person_id, a]));

        let created = 0;
        let updated = 0;

        for (const person of people as Person[]) {
          const existing = existingByPerson.get(person.id);

          if (!existing) {
            await supabase.from('person_initiative_assignments').insert({
              person_id: person.id,
              initiative_id: initiative.id,
              quarterly_effort: { [quarter]: effortValue } as unknown as Json,
              is_auto: true,
            });
            created++;
          } else if (existing.is_auto) {
            const newEffort = {
              ...(existing.quarterly_effort as Record<string, number>),
              [quarter]: effortValue,
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
            description: `Создано: ${created}, обновлено: ${updated}`,
          });
        }
      } catch (err) {
        console.error('Sync assignments error:', err);
      }
    },
    [queryClient, toast]
  );

  const updateQuarterData = useCallback(
    (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean | GeoCostSplit | undefined) => {
      const key = `${id}-quarterly-${quarter}-${field}`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const currentData = queryClient.getQueryData<AdminDataRow[]>(['initiatives']);
      const currentRow = currentData?.find((r) => r.id === id);
      if (!currentRow) return;

      const prevQ = currentRow.quarterlyData[quarter] || createEmptyQuarterData();
      const nextQuarter =
        field === 'costFinanceConfirmed'
          ? { ...prevQ, [field]: value as boolean }
          : { ...prevQ, [field]: value, costFinanceConfirmed: true };
      const updatedQuarterlyData = {
        ...currentRow.quarterlyData,
        [quarter]: nextQuarter,
      };

      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) =>
          row.id === id ? { ...row, quarterlyData: updatedQuarterlyData } : row
        );
      });

      setSyncStatus('saving');

      const delay =
        field === 'geoCostSplit'
          ? 400
          : typeof value === 'boolean'
            ? 0
            : typeof value === 'number'
              ? 500
              : 1000;

      const timer = setTimeout(async () => {
        updateMutation.mutate({
          id,
          patch: { quarterly_data: quarterlyDataToJson(updatedQuarterlyData) },
        });

        if (field === 'effortCoefficient' && typeof value === 'number' && value > 0) {
          const updatedRow = { ...currentRow, quarterlyData: updatedQuarterlyData };
          await syncAssignments(updatedRow, quarter, value);
        }

        debounceTimers.current.delete(key);
        setPendingCount(debounceTimers.current.size);
      }, delay);

      debounceTimers.current.set(key, timer);
      setPendingCount(debounceTimers.current.size);
    },
    [updateMutation, queryClient, syncAssignments]
  );

  const updateQuarterDataBulk = useCallback(
    (id: string, quarterlyData: Record<string, AdminQuarterData>) => {
      setSyncStatus('saving');
      setLastError(null);
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id === id ? { ...row, quarterlyData } : row));
      });
      updateMutation.mutate({
        id,
        patch: { quarterly_data: quarterlyDataToJson(quarterlyData) },
      });
    },
    [updateMutation, queryClient]
  );

  const updateQuarterDataBulkAsync = useCallback(
    async (id: string, quarterlyData: Record<string, AdminQuarterData>) => {
      setSyncStatus('saving');
      setLastError(null);
      await updateMutation.mutateAsync({
        id,
        patch: { quarterly_data: quarterlyDataToJson(quarterlyData) },
      });
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id === id ? { ...row, quarterlyData } : row));
      });
    },
    [updateMutation, queryClient]
  );

  const immediateUpdate = useCallback(
    (id: string, field: string, value: unknown) => {
      const latest = queryClient.getQueryData<AdminDataRow[]>(['initiatives'])?.find((r) => r.id === id);
      if (!latest) return;
      const dbColumn = FIELD_TO_COLUMN[field] || field;
      queryClient.setQueryData(['initiatives'], (old: AdminDataRow[] | undefined) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id === id ? { ...row, [field]: value } : row));
      });
      updateMutation.mutate({
        id,
        patch: { [dbColumn]: value },
      });
    },
    [updateMutation, queryClient]
  );

  const beginBulkInitiativeMutations = useCallback((expectedSettledCount: number) => {
    if (expectedSettledCount > 0) {
      bulkInitiativeInvalidateSkipsRef.current = expectedSettledCount;
    }
  }, []);

  /** Если пакет прервался — сброс счётчика и один refetch. */
  const finalizeBulkInitiativeMutations = useCallback(() => {
    if (bulkInitiativeInvalidateSkipsRef.current > 0) {
      bulkInitiativeInvalidateSkipsRef.current = 0;
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    }
  }, [queryClient]);

  const updateInitiativeFieldAsync = useCallback(
    async (id: string, field: string, value: unknown) => {
      const dbColumn = FIELD_TO_COLUMN[field] || field;
      await updateMutation.mutateAsync({
        id,
        patch: { [dbColumn]: value },
      });
    },
    [updateMutation]
  );

  const flushPendingChanges = useCallback(() => {
    debounceTimers.current.forEach((timer) => clearTimeout(timer));
    debounceTimers.current.clear();
    setPendingCount(0);
  }, []);

  const retry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['initiatives'] });
    setSyncStatus('synced');
    setLastError(null);
  }, [queryClient]);

  return {
    updateInitiative: debouncedUpdate,
    updateQuarterData,
    updateQuarterDataBulk,
    updateQuarterDataBulkAsync,
    immediateUpdate,
    updateInitiativeFieldAsync,
    syncAssignments,
    createInitiative: createMutation.mutateAsync,
    deleteInitiative: deleteMutation.mutateAsync,
    syncStatus,
    isSaving: updateMutation.isPending || createMutation.isPending || deleteMutation.isPending,
    pendingChanges: pendingCount,
    lastError,
    flushPendingChanges,
    retry,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
  };
}
