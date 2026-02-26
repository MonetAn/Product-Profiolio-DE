import { useCallback } from 'react';
import { AdminDataRow, exportAdminCSV, createEmptyQuarterData } from '@/lib/adminDataManager';
import { useToast } from '@/hooks/use-toast';

interface UseCSVExportOptions {
  quarters: string[];
}

export function useCSVExport({ quarters }: UseCSVExportOptions) {
  const { toast } = useToast();

  const downloadCSV = useCallback((
    data: AdminDataRow[],
    filename: string,
    description: string
  ) => {
    if (data.length === 0) {
      toast({
        title: 'Нет данных',
        description: 'Нет инициатив для скачивания',
        variant: 'destructive'
      });
      return;
    }

    // Generate CSV with BOM for Excel
    const csv = exportAdminCSV(data, quarters, []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Файл скачан',
      description
    });
  }, [quarters, toast]);

  const exportAll = useCallback((data: AdminDataRow[]) => {
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(
      data, 
      `portfolio-all-${date}.csv`,
      `Скачано ${data.length} инициатив`
    );
  }, [downloadCSV]);

  const exportFiltered = useCallback((data: AdminDataRow[]) => {
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(
      data, 
      `portfolio-filtered-${date}.csv`,
      `Скачано ${data.length} отфильтрованных инициатив`
    );
  }, [downloadCSV]);

  return {
    exportAll,
    exportFiltered,
    downloadCSV,
  };
}
