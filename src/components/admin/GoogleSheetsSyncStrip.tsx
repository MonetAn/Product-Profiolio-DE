import { useState, useCallback } from 'react';
import { CloudUpload, CloudDownload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

interface GoogleSheetsSyncStripProps {
  /** После успешного импорта обновить данные в админке */
  onAfterImport?: () => void;
}

/**
 * Админ: выгрузка инициатив в Google Sheet и импорт коэффициентов с листа.
 * См. docs/GOOGLE_SHEETS_SYNC.md
 */
export function GoogleSheetsSyncStrip({ onAfterImport }: GoogleSheetsSyncStripProps) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      const body = (await invokeEdgeFunction('sheets-export-initiatives')) as {
        rowsWritten?: number;
        tab?: string;
      };
      toast({
        title: 'Таблица обновлена',
        description: `Вкладка «${body.tab ?? '—'}»: строк ${body.rowsWritten ?? 0}`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Ошибка выгрузки',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setExporting(false);
    }
  }, [toast]);

  const runImport = useCallback(async () => {
    setImporting(true);
    try {
      const body = (await invokeEdgeFunction('sheets-import-from-sheet')) as {
        updated?: number;
        rowsScanned?: number;
        errors?: string[];
        errorCount?: number;
      };
      const errHint =
        body.errorCount && body.errorCount > 0
          ? ` Предупреждений: ${body.errorCount}.`
          : '';
      toast({
        title: 'Импорт из таблицы',
        description: `Обновлено записей: ${body.updated ?? 0} (просмотрено строк: ${body.rowsScanned ?? 0}).${errHint}`,
      });
      if (body.errors?.length) {
        console.warn('[GoogleSheets import]', body.errors);
      }
      onAfterImport?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Ошибка импорта',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setImporting(false);
    }
  }, [toast, onAfterImport]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 text-sm">
      <span className="text-muted-foreground mr-1">Google Sheets:</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={exporting}
        onClick={runExport}
      >
        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
        Выгрузить в лист
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={importing}
        onClick={runImport}
      >
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
        Импорт с листа
      </Button>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        Вкладки «Portfolio export» / «Portfolio import» — см. docs/GOOGLE_SHEETS_SYNC.md
      </span>
    </div>
  );
}
