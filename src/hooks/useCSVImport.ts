import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { parseAdminCSV, AdminDataRow, normalizeSupportCascade } from '@/lib/adminDataManager';
import { useToast } from '@/hooks/use-toast';

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
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

  return {
    importCSV,
    isImporting,
    progress,
  };
}
