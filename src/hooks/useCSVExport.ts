import { useCallback } from 'react';
import {
  AdminDataRow,
  exportAdminCSV,
  exportGeoCostSplitCSV,
  type GeoExportCountry,
} from '@/lib/adminDataManager';
import { useToast } from '@/hooks/use-toast';

interface UseCSVExportOptions {
  quarters: string[];
  marketCountries?: GeoExportCountry[];
}

export function useCSVExport({ quarters, marketCountries = [] }: UseCSVExportOptions) {
  const { toast } = useToast();

  const downloadCSV = useCallback(
    (data: AdminDataRow[], filename: string, description: string) => {
      if (data.length === 0) {
        toast({
          title: 'Нет данных',
          description: 'Нет инициатив для скачивания',
          variant: 'destructive',
        });
        return;
      }

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
        description,
      });
    },
    [quarters, toast]
  );

  const downloadGeoSplitCSV = useCallback(
    (data: AdminDataRow[], filename: string, description: string) => {
      if (data.length === 0) {
        toast({
          title: 'Нет данных',
          description: 'Нет инициатив для скачивания',
          variant: 'destructive',
        });
        return;
      }
      if (marketCountries.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Справочник стран не загружен',
          description: 'Обновите страницу или откройте раздел «Рынки».',
        });
        return;
      }

      const csv = exportGeoCostSplitCSV(data, quarters, marketCountries);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Файл скачан',
        description,
      });
    },
    [quarters, marketCountries, toast]
  );

  const exportAll = useCallback(
    (data: AdminDataRow[]) => {
      const date = new Date().toISOString().split('T')[0];
      downloadCSV(data, `portfolio-all-${date}.csv`, `Скачано ${data.length} инициатив`);
    },
    [downloadCSV]
  );

  const exportFiltered = useCallback(
    (data: AdminDataRow[]) => {
      const date = new Date().toISOString().split('T')[0];
      downloadCSV(
        data,
        `portfolio-filtered-${date}.csv`,
        `Скачано ${data.length} отфильтрованных инициатив`
      );
    },
    [downloadCSV]
  );

  const exportGeoSplitAll = useCallback(
    (data: AdminDataRow[]) => {
      const date = new Date().toISOString().split('T')[0];
      downloadGeoSplitCSV(
        data,
        `portfolio-geo-split-all-${date}.csv`,
        `Распределение по странам: ${data.length} инициатив`
      );
    },
    [downloadGeoSplitCSV]
  );

  const exportGeoSplitFiltered = useCallback(
    (data: AdminDataRow[]) => {
      const date = new Date().toISOString().split('T')[0];
      downloadGeoSplitCSV(
        data,
        `portfolio-geo-split-filtered-${date}.csv`,
        `Распределение по странам: ${data.length} строк`
      );
    },
    [downloadGeoSplitCSV]
  );

  return {
    exportAll,
    exportFiltered,
    exportGeoSplitAll,
    exportGeoSplitFiltered,
    downloadCSV,
  };
}
