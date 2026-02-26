import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { parseAdminCSV, AdminDataRow } from '@/lib/adminDataManager';
import { useToast } from '@/hooks/use-toast';

interface ImportResult {
  imported: number;
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
    options: { skipDuplicates: boolean } = { skipDuplicates: true }
  ): Promise<ImportResult> => {
    setIsImporting(true);
    setProgress(0);

    const result: ImportResult = {
      imported: 0,
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

      setProgress(10);

      // Fetch existing initiatives to check for duplicates
      const { data: existing, error: fetchError } = await supabase
        .from('initiatives')
        .select('unit, team, initiative');

      if (fetchError) throw fetchError;

      const existingKeys = new Set(
        (existing || []).map(e => `${e.unit}|${e.team}|${e.initiative}`)
      );

      setProgress(20);

      // Filter and prepare data for import
      const toImport: AdminDataRow[] = [];
      
      parsedData.forEach(row => {
        const key = `${row.unit}|${row.team}|${row.initiative}`;
        
        if (existingKeys.has(key)) {
          if (options.skipDuplicates) {
            result.skipped++;
          } else {
            // TODO: Handle update existing
            result.skipped++;
          }
        } else {
          toImport.push(row);
        }
      });

      setProgress(30);

      // Batch insert in chunks
      const BATCH_SIZE = 50;
      const batches = [];
      
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

        setProgress(30 + Math.round((i + 1) / batches.length * 70));
      }

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });

      toast({
        title: 'Импорт завершён',
        description: `Импортировано: ${result.imported}, Пропущено: ${result.skipped}${result.errors.length ? `, Ошибок: ${result.errors.length}` : ''}`
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
