import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRef, useCallback, useState, useEffect } from 'react';
import {
  AdminDataRow,
  AdminQuarterData,
  confirmFinanceForAllQuartersInData,
  createEmptyQuarterData,
  geoCostSplitToJson,
  parseGeoCostSplit,
  type GeoCostSplit,
} from '@/lib/adminDataManager';
import {
  quarterlyDataToJson,
  quarterlyJsonToAdminRecord,
  INITIATIVES_QUERY_KEY,
} from './useInitiatives';
import { useToast } from '@/hooks/use-toast';
import { Person } from '@/lib/peopleDataManager';
import { Json } from '@/integrations/supabase/types';

const FIELD_TO_COLUMN: Record<string, string> = {
  unit: 'unit',
  team: 'team',
  initiative: 'initiative',
  stakeholdersList: 'stakeholders_list',
  description: 'description',
  documentationLink: 'documentation_link',
  stakeholders: 'stakeholders',
  isTimelineStub: 'is_timeline_stub',
  quarterlyData: 'quarterly_data',
  initiativeGeoCostSplit: 'geo_cost_split',
};

/** Суффиксы ключей `debouncedUpdate` — от длинного к короткому (id в UUID с дефисами). */
const INIT_DEBOUNCE_KEY_SUFFIXES = [
  'documentationLink',
  'stakeholdersList',
  'isTimelineStub',
  'description',
  'stakeholders',
  'initiative',
  'team',
  'unit',
  'initiativeGeoCostSplit',
] as const;

const SYNC_ASSIGNMENTS_PEOPLE_SELECT_COLUMNS = ['id'].join(', ');
const SYNC_ASSIGNMENTS_EXISTING_SELECT_COLUMNS = ['id', 'person_id', 'quarterly_effort', 'is_auto'].join(', ');
const SYNC_ASSIGNMENTS_WRITE_CHUNK = 20;

/** Список инициатив кэшируется с ключом `['initiatives', { units, teams, tableAll }]` — обновляем все совпадающие запросы. */
function findRowInInitiativeCaches(queryClient: QueryClient, id: string): AdminDataRow | undefined {
  const entries = queryClient.getQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY });
  for (const [, data] of entries) {
    const row = data?.find((r) => r.id === id);
    if (row) return row;
  }
  return undefined;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' && typeof right !== 'object') return false;
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

function applyPatchToAdminRow(row: AdminDataRow, patch: Record<string, unknown>): AdminDataRow {
  const next = { ...row };
  const p = patch;
  if (p.unit !== undefined) next.unit = p.unit as string;
  if (p.team !== undefined) next.team = p.team as string;
  if (p.initiative !== undefined) next.initiative = p.initiative as string;
  if (p.stakeholders_list !== undefined) next.stakeholdersList = p.stakeholders_list as string[];
  if (p.description !== undefined) next.description = p.description as string;
  if (p.documentation_link !== undefined) next.documentationLink = p.documentation_link as string;
  if (p.stakeholders !== undefined) next.stakeholders = p.stakeholders as string;
  if (p.is_timeline_stub !== undefined) next.isTimelineStub = p.is_timeline_stub as boolean;
  if (p.quarterly_data !== undefined) {
    next.quarterlyData = quarterlyJsonToAdminRecord(p.quarterly_data);
  }
  if (p.geo_cost_split !== undefined) {
    const g = parseGeoCostSplit(p.geo_cost_split);
    if (g) next.initiativeGeoCostSplit = g;
    else delete next.initiativeGeoCostSplit;
  }
  return next;
}

export type SyncStatus = 'synced' | 'saving' | 'error' | 'offline';

export function useInitiativeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const invalidateTimerRef = useRef<NodeJS.Timeout | null>(null);
  /** Сколько ближайших onSettled пропустить с отдельным invalidate — одна инвалидация в конце пакета (Quick Flow). */
  const bulkInitiativeInvalidateSkipsRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setPendingCount(debounceTimers.current.size);
  }, [debounceTimers.current.size]);

  useEffect(() => {
    return () => {
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    };
  }, []);

  /** После записи даём БД/реплике чуть больше времени до GET — меньше шанс отката UI до старого текста. */
  const scheduleInitiativesInvalidate = useCallback((delayMs = 650) => {
    if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: INITIATIVES_QUERY_KEY });
      invalidateTimerRef.current = null;
    }, delayMs);
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('initiatives').update(vars.patch).eq('id', vars.id);
      if (error) throw error;
    },
    onMutate: async (variables) => {
      setSyncStatus('saving');
      setLastError(null);
      await queryClient.cancelQueries({ queryKey: INITIATIVES_QUERY_KEY });
      const previousEntries = queryClient.getQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY });
      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.map((row) =>
          row.id === variables.id ? applyPatchToAdminRow(row, variables.patch) : row
        );
      });
      return { previousEntries };
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
      if (context?.previousEntries) {
        for (const [queryKey, data] of context.previousEntries) {
          queryClient.setQueryData(queryKey, data);
        }
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
          scheduleInitiativesInvalidate(0);
        }
        return;
      }
      scheduleInitiativesInvalidate();
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
          stakeholders_list: data.stakeholdersList,
          description: data.description,
          documentation_link: data.documentationLink,
          stakeholders: data.stakeholders,
          is_timeline_stub: data.isTimelineStub ?? false,
          quarterly_data: quarterlyDataToJson(qd),
          geo_cost_split:
            data.initiativeGeoCostSplit?.entries?.length
              ? (geoCostSplitToJson(data.initiativeGeoCostSplit) as Json)
              : null,
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
      scheduleInitiativesInvalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('initiatives')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      setSyncStatus('saving');
      await queryClient.cancelQueries({ queryKey: INITIATIVES_QUERY_KEY });
      const previousEntries = queryClient.getQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY });
      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.filter((row) => row.id !== id);
      });
      return { previousEntries };
    },
    onError: (err, id, context) => {
      console.error('Delete failed:', err);
      setSyncStatus('error');
      if (context?.previousEntries) {
        for (const [queryKey, data] of context.previousEntries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast({
        title: 'Ошибка удаления',
        description: 'Не удалось удалить инициативу.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      setSyncStatus('synced');
      scheduleInitiativesInvalidate();
    },
  });

  const debouncedUpdate = useCallback(
    (id: string, field: string, value: unknown, delay = 1000) => {
      const key = `${id}-${field}`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);
      const latest = findRowInInitiativeCaches(queryClient, id);
      if (!latest) return;
      const originalValue = (latest as unknown as Record<string, unknown>)[field];
      if (valuesEqual(originalValue, value)) return;

      const dbColumn = FIELD_TO_COLUMN[field] || field;

      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id !== id ? row : { ...row, [field]: value }));
      });

      setSyncStatus('saving');
      setPendingCount(debounceTimers.current.size + 1);

      const timer = setTimeout(() => {
        const latestRow = findRowInInitiativeCaches(queryClient, id);
        if (!latestRow) {
          debounceTimers.current.delete(key);
          setPendingCount(debounceTimers.current.size);
          return;
        }
        const latestValue = (latestRow as unknown as Record<string, unknown>)[field];
        if (valuesEqual(latestValue, originalValue)) {
          debounceTimers.current.delete(key);
          if (debounceTimers.current.size === 0) setSyncStatus('synced');
          setPendingCount(debounceTimers.current.size);
          return;
        }
        updateMutation.mutate({
          id,
          patch: { [dbColumn]: latestValue },
        });
        debounceTimers.current.delete(key);
        setPendingCount(debounceTimers.current.size);
      }, delay);

      debounceTimers.current.set(key, timer);
      setPendingCount(debounceTimers.current.size);
    },
    [updateMutation, queryClient]
  );

  /**
   * Копирует командный effortCoefficient в person_initiative_assignments для людей команды
   * только где is_auto: true. Ручные правки (is_auto: false) не перезаписываются.
   */
  const syncAssignments = useCallback(
    async (initiative: AdminDataRow, quarter: string, effortValue: number) => {
      try {
        const { data: people, error: peopleError } = await supabase
          .from('people')
          .select(SYNC_ASSIGNMENTS_PEOPLE_SELECT_COLUMNS)
          .eq('unit', initiative.unit)
          .eq('team', initiative.team)
          .is('terminated_at', null);

        if (peopleError) throw peopleError;
        if (!people || people.length === 0) return;

        const { data: existingAssignments, error: assignError } = await supabase
          .from('person_initiative_assignments')
          .select(SYNC_ASSIGNMENTS_EXISTING_SELECT_COLUMNS)
          .eq('initiative_id', initiative.id);

        if (assignError) throw assignError;

        const existingByPerson = new Map((existingAssignments || []).map((a) => [a.person_id, a]));

        const inserts: Array<{ person_id: string; initiative_id: string; quarterly_effort: Json; is_auto: true }> = [];
        const updates: Array<{ id: string; quarterly_effort: Json }> = [];
        for (const person of people as Person[]) {
          const existing = existingByPerson.get(person.id);

          if (!existing) {
            inserts.push({
              person_id: person.id,
              initiative_id: initiative.id,
              quarterly_effort: { [quarter]: effortValue } as unknown as Json,
              is_auto: true,
            });
          } else if (existing.is_auto) {
            const newEffort = {
              ...(existing.quarterly_effort as Record<string, number>),
              [quarter]: effortValue,
            };
            updates.push({ id: existing.id, quarterly_effort: newEffort as unknown as Json });
          }
        }

        for (let i = 0; i < inserts.length; i += SYNC_ASSIGNMENTS_WRITE_CHUNK) {
          const chunk = inserts.slice(i, i + SYNC_ASSIGNMENTS_WRITE_CHUNK);
          const { error } = await supabase.from('person_initiative_assignments').insert(chunk);
          if (error) throw error;
        }
        for (let i = 0; i < updates.length; i += SYNC_ASSIGNMENTS_WRITE_CHUNK) {
          const chunk = updates.slice(i, i + SYNC_ASSIGNMENTS_WRITE_CHUNK);
          const settled = await Promise.all(
            chunk.map((u) =>
              supabase
                .from('person_initiative_assignments')
                .update({ quarterly_effort: u.quarterly_effort })
                .eq('id', u.id)
            )
          );
          for (const res of settled) {
            if (res.error) throw res.error;
          }
        }

        const created = inserts.length;
        const updated = updates.length;
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
    (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean | undefined) => {
      const key = `${id}-quarterly-${quarter}-${field}`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const currentRow = findRowInInitiativeCaches(queryClient, id);
      if (!currentRow) return;

      const prevQ = currentRow.quarterlyData[quarter] || createEmptyQuarterData();
      if (valuesEqual(prevQ[field], value)) return;
      const nextQuarter =
        field === 'costFinanceConfirmed'
          ? { ...prevQ, [field]: value as boolean }
          : { ...prevQ, [field]: value, costFinanceConfirmed: true };
      const updatedQuarterlyData = {
        ...currentRow.quarterlyData,
        [quarter]: nextQuarter,
      };

      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.map((row) =>
          row.id === id ? { ...row, quarterlyData: updatedQuarterlyData } : row
        );
      });

      setSyncStatus('saving');

      const delay =
        typeof value === 'boolean'
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
      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
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
      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.map((row) => (row.id === id ? { ...row, quarterlyData } : row));
      });
    },
    [updateMutation, queryClient]
  );

  const immediateUpdate = useCallback(
    (id: string, field: string, value: unknown) => {
      if (!findRowInInitiativeCaches(queryClient, id)) return;
      const dbColumn = FIELD_TO_COLUMN[field] || field;
      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
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
      queryClient.invalidateQueries({ queryKey: INITIATIVES_QUERY_KEY });
    }
  }, [queryClient]);

  const updateInitiativeFieldAsync = useCallback(
    async (id: string, field: string, value: unknown) => {
      if (field === 'initiativeGeoCostSplit') {
        const split = value as GeoCostSplit | undefined;
        await updateMutation.mutateAsync({
          id,
          patch: {
            geo_cost_split:
              split?.entries?.length ? (geoCostSplitToJson(split) as Json) : null,
          },
        });
        return;
      }
      const dbColumn = FIELD_TO_COLUMN[field] || field;
      await updateMutation.mutateAsync({
        id,
        patch: { [dbColumn]: value },
      });
    },
    [updateMutation]
  );

  const updateInitiativeGeoCostSplit = useCallback(
    (id: string, split: GeoCostSplit | undefined) => {
      const key = `${id}-initiativeGeoCostSplit`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const currentRow = findRowInInitiativeCaches(queryClient, id);
      if (!currentRow) return;

      const normalized = split?.entries?.length ? split : undefined;
      if (valuesEqual(currentRow.initiativeGeoCostSplit, normalized)) return;

      queryClient.setQueriesData<AdminDataRow[]>({ queryKey: INITIATIVES_QUERY_KEY }, (old) => {
        if (old === undefined) return undefined;
        return old.map((row) =>
          row.id === id ? { ...row, initiativeGeoCostSplit: normalized } : row
        );
      });

      setSyncStatus('saving');
      setPendingCount(debounceTimers.current.size + 1);

      const timer = setTimeout(() => {
        updateMutation.mutate({
          id,
          patch: {
            geo_cost_split:
              normalized?.entries?.length
                ? (geoCostSplitToJson(normalized) as Json)
                : null,
          },
        });
        debounceTimers.current.delete(key);
        setPendingCount(debounceTimers.current.size);
      }, 400);

      debounceTimers.current.set(key, timer);
      setPendingCount(debounceTimers.current.size);
    },
    [updateMutation, queryClient]
  );

  /** Сразу отправить в БД все отложенные debounce-обновления (кнопка «Сохранить»). */
  const flushDebouncedSavesNow = useCallback(async () => {
    const keys = [...debounceTimers.current.keys()];
    for (const key of keys) {
      const t = debounceTimers.current.get(key);
      if (t) clearTimeout(t);
      debounceTimers.current.delete(key);
    }
    setPendingCount(0);

    if (keys.length === 0) {
      setSyncStatus('synced');
      return;
    }

    setSyncStatus('saving');
    setLastError(null);

    const quarterKeyRe = /^(.+)-quarterly-(\d{4}-Q\d)-(.+)$/;

    for (const key of keys) {
      const qm = key.match(quarterKeyRe);
      if (qm) {
        const [, id, quarter, field] = qm;
        const currentRow = findRowInInitiativeCaches(queryClient, id);
        if (!currentRow) continue;
        await updateMutation.mutateAsync({
          id,
          patch: { quarterly_data: quarterlyDataToJson(currentRow.quarterlyData) },
        });
        if (field === 'effortCoefficient') {
          const eff = Math.max(
            0,
            Math.min(100, Number(currentRow.quarterlyData[quarter]?.effortCoefficient) || 0)
          );
          if (eff > 0) {
            await syncAssignments(currentRow, quarter, eff);
          }
        }
        continue;
      }

      let parsed: { id: string; field: string } | null = null;
      for (const suffix of INIT_DEBOUNCE_KEY_SUFFIXES) {
        if (key.endsWith(`-${suffix}`)) {
          parsed = { id: key.slice(0, -(suffix.length + 1)), field: suffix };
          break;
        }
      }
      if (!parsed) {
        console.warn('[flushDebouncedSavesNow] unrecognized debounce key:', key);
        continue;
      }
      const latest = findRowInInitiativeCaches(queryClient, parsed.id);
      if (!latest) continue;
      if (parsed.field === 'initiativeGeoCostSplit') {
        const split = latest.initiativeGeoCostSplit;
        await updateMutation.mutateAsync({
          id: parsed.id,
          patch: {
            geo_cost_split:
              split?.entries?.length ? (geoCostSplitToJson(split) as Json) : null,
          },
        });
        continue;
      }
      const dbColumn = FIELD_TO_COLUMN[parsed.field] || parsed.field;
      const latestValue = (latest as unknown as Record<string, unknown>)[parsed.field];
      await updateMutation.mutateAsync({
        id: parsed.id,
        patch: { [dbColumn]: latestValue },
      });
    }

    setSyncStatus('synced');
    scheduleInitiativesInvalidate(0);
  }, [queryClient, updateMutation, syncAssignments, scheduleInitiativesInvalidate]);

  const flushPendingChanges = useCallback(() => {
    debounceTimers.current.forEach((timer) => clearTimeout(timer));
    debounceTimers.current.clear();
    setPendingCount(0);
  }, []);

  const retry = useCallback(() => {
    scheduleInitiativesInvalidate(0);
    setSyncStatus('synced');
    setLastError(null);
  }, [scheduleInitiativesInvalidate]);

  return {
    updateInitiative: debouncedUpdate,
    updateQuarterData,
    updateQuarterDataBulk,
    updateQuarterDataBulkAsync,
    immediateUpdate,
    updateInitiativeFieldAsync,
    updateInitiativeGeoCostSplit,
    syncAssignments,
    createInitiative: createMutation.mutateAsync,
    deleteInitiative: deleteMutation.mutateAsync,
    syncStatus,
    isSaving: updateMutation.isPending || createMutation.isPending || deleteMutation.isPending,
    pendingChanges: pendingCount,
    lastError,
    flushPendingChanges,
    flushDebouncedSavesNow,
    retry,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
  };
}
