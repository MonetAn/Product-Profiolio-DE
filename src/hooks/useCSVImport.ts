import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseAdminCSV,
  parseCostOnlyCSV,
  AdminDataRow,
  AdminQuarterData,
  normalizeSupportCascade,
  createEmptyQuarterData,
  type CostOnlyRow,
} from '@/lib/adminDataManager';
import { quarterlyDataToJson } from '@/hooks/useInitiatives';
import { useToast } from '@/hooks/use-toast';

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface CostOnlyImportResult {
  updated: number;
  notFound: number;
  errors: string[];
}

function rawQuarterlyDataToAdmin(raw: unknown): Record<string, AdminQuarterData> {
  const out: Record<string, AdminQuarterData> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  Object.entries(obj).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const v = value as Record<string, unknown>;
    out[key] = {
      cost: typeof v.cost === 'number' ? v.cost : 0,
      otherCosts: typeof v.otherCosts === 'number' ? v.otherCosts : 0,
      support: typeof v.support === 'boolean' ? v.support : false,
      onTrack: typeof v.onTrack === 'boolean' ? v.onTrack : true,
      metricPlan: typeof v.metricPlan === 'string' ? v.metricPlan : '',
      metricFact: typeof v.metricFact === 'string' ? v.metricFact : '',
      comment: typeof v.comment === 'string' ? v.comment : '',
      effortCoefficient: typeof v.effortCoefficient === 'number' ? v.effortCoefficient : 0,
    };
  });
  return out;
}

export function useCSVImport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const importCSV = useCallback(async (
    file: File,
    options: { skipDuplicates: boolean; updateExisting?: boolean } = { skipDuplicates: true, updateExisting: false }
  ): Promise<ImportResult> => {
    setIsImporting(true);
    setProgress(0);

    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Read file
      const text = await file.text();
      const { data: parsedData, quarters } = parseAdminCSV(text);

      if (parsedData.length === 0) {
        throw new Error('CSV файл пустой или имеет неверный формат');
      }

      // Normalize support cascade on every row before insert/update
      const normalizedData = parsedData.map(row => normalizeSupportCascade(row, quarters));

      setProgress(10);

      // Fetch existing initiatives (id + key) for duplicate check and update
      const { data: existing, error: fetchError } = await supabase
        .from('initiatives')
        .select('id, unit, team, initiative');

      if (fetchError) throw fetchError;

      const existingByKey = new Map(
        (existing || []).map(e => [`${e.unit}|${e.team}|${e.initiative}`, { id: e.id }])
      );

      setProgress(20);

      const toImport: AdminDataRow[] = [];
      const toUpdate: { id: string; row: AdminDataRow }[] = [];

      normalizedData.forEach(row => {
        const key = `${row.unit}|${row.team}|${row.initiative}`;
        const existingRow = existingByKey.get(key);

        if (existingRow) {
          if (options.updateExisting) {
            toUpdate.push({ id: existingRow.id, row });
          } else {
            result.skipped++;
          }
        } else {
          toImport.push(row);
        }
      });

      setProgress(30);

      // Update existing initiatives (stakeholders + normalized quarterly_data)
      if (toUpdate.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
          const batch = toUpdate.slice(i, i + BATCH_SIZE);
          for (const { id, row } of batch) {
            const { error: updateError } = await supabase
              .from('initiatives')
              .update({
                initiative_type: row.initiativeType || null,
                stakeholders_list: row.stakeholdersList,
                stakeholders: row.stakeholders,
                description: row.description,
                documentation_link: row.documentationLink,
                quarterly_data: row.quarterlyData,
              })
              .eq('id', id);

            if (updateError) {
              result.errors.push(`Update ${row.initiative}: ${updateError.message}`);
            } else {
              result.updated++;
            }
          }
          setProgress(30 + Math.round((i + batch.length) / toUpdate.length * 35));
        }
      }

      // Insert new initiatives
      const BATCH_SIZE = 50;
      const batches: AdminDataRow[][] = [];
      for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        batches.push(toImport.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const insertData = batch.map(row => ({
          unit: row.unit,
          team: row.team,
          initiative: row.initiative,
          initiative_type: row.initiativeType || null,
          stakeholders_list: row.stakeholdersList,
          description: row.description,
          documentation_link: row.documentationLink,
          stakeholders: row.stakeholders,
          quarterly_data: row.quarterlyData,
        }));

        const { error: insertError } = await supabase
          .from('initiatives')
          .insert(insertData);

        if (insertError) {
          result.errors.push(`Batch ${i + 1}: ${insertError.message}`);
        } else {
          result.imported += batch.length;
        }

        setProgress(65 + Math.round((i + 1) / batches.length * 35));
      }

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });

      const parts = [`Импорт: ${result.imported}`, `Обновлено: ${result.updated}`, `Пропущено: ${result.skipped}`];
      if (result.errors.length) parts.push(`Ошибок: ${result.errors.length}`);

      toast({
        title: 'Импорт завершён',
        description: parts.join(', '),
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      result.errors.push(message);
      
      toast({
        title: 'Ошибка импорта',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsImporting(false);
      setProgress(100);
    }

    return result;
  }, [queryClient, toast]);

  const importCostOnlyCSV = useCallback(
    async (file: File): Promise<CostOnlyImportResult> => {
      setIsImporting(true);
      setProgress(0);

      const result: CostOnlyImportResult = { updated: 0, notFound: 0, errors: [] };

      try {
        const text = await file.text();
        const { rows: costRows, quarters } = parseCostOnlyCSV(text);

        if (costRows.length === 0) {
          throw new Error('CSV пустой или не содержит строк с инициативами и кварталами');
        }

        if (quarters.length === 0) {
          throw new Error('Не найдены колонки кварталов (ожидаются Q1 25, Q2 25, … или 25_Q1, 26_Q2, …)');
        }

        setProgress(10);

        const { data: existing, error: fetchError } = await supabase
          .from('initiatives')
          .select('id, unit, team, initiative, quarterly_data');

        if (fetchError) throw fetchError;

        const byKey = new Map<string, { id: string; quarterly_data: unknown }>();
        const byName = new Map<string, { id: string; unit: string; team: string; quarterly_data: unknown }[]>();
        (existing || []).forEach((e) => {
          const key = `${e.unit}|${e.team}|${e.initiative}`;
          byKey.set(key, { id: e.id, quarterly_data: e.quarterly_data });
          const list = byName.get(e.initiative) || [];
          list.push({
            id: e.id,
            unit: e.unit,
            team: e.team,
            quarterly_data: e.quarterly_data,
          });
          byName.set(e.initiative, list);
        });

        setProgress(20);

        const BATCH_SIZE = 25;
        let done = 0;
        for (let i = 0; i < costRows.length; i++) {
          const row: CostOnlyRow = costRows[i];
          let match: { id: string; quarterly_data: unknown } | null = null;

          if (row.unit != null && row.team != null) {
            match = byKey.get(`${row.unit}|${row.team}|${row.initiative}`) || null;
          }
          if (!match) {
            const list = byName.get(row.initiative);
            if (list?.length === 1) match = { id: list[0].id, quarterly_data: list[0].quarterly_data };
            else if (list && list.length > 1) match = { id: list[0].id, quarterly_data: list[0].quarterly_data };
          }

          if (!match) {
            result.notFound++;
            continue;
          }

          const merged = rawQuarterlyDataToAdmin(match.quarterly_data);
          Object.entries(row.costs).forEach(([q, cost]) => {
            const prev = merged[q] || createEmptyQuarterData();
            merged[q] = { ...prev, cost };
          });

          const { error: updateError } = await supabase
            .from('initiatives')
            .update({ quarterly_data: quarterlyDataToJson(merged) })
            .eq('id', match.id);

          if (updateError) {
            result.errors.push(`${row.initiative}: ${updateError.message}`);
          } else {
            result.updated++;
          }

          done++;
          if (done % BATCH_SIZE === 0) {
            setProgress(20 + Math.round((done / costRows.length) * 70));
          }
        }

        setProgress(95);
        queryClient.invalidateQueries({ queryKey: ['initiatives'] });

        const parts = [
          `Обновлено: ${result.updated}`,
          `Не найдено: ${result.notFound}`,
        ];
        if (result.errors.length) parts.push(`Ошибок: ${result.errors.length}`);

        toast({
          title: 'Импорт стоимости завершён',
          description: parts.join(', '),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        result.errors.push(message);
        toast({
          title: 'Ошибка импорта стоимости',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsImporting(false);
        setProgress(100);
      }

      return result;
    },
    [queryClient, toast]
  );

  return {
    importCSV,
    importCostOnlyCSV,
    isImporting,
    progress,
  };
}
