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
  const [pushIn, setPushIn] = useState(false);
  const [pullOut, setPullOut] = useState(false);

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

  const runPushIn = useCallback(async () => {
    setPushIn(true);
    try {
      const body = (await invokeEdgeFunction('sheets-push-in')) as {
        rowsWritten?: number;
        tab?: string;
        message?: string;
      };
      toast({
        title: 'Лист IN обновлён',
        description:
          body.message ??
          `Вкладка «${body.tab ?? 'IN'}»: строк данных ${body.rowsWritten ?? 0}`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Ошибка выгрузки в IN',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPushIn(false);
    }
  }, [toast]);

  const runPullOut = useCallback(async () => {
    setPullOut(true);
    try {
      const body = (await invokeEdgeFunction('sheets-pull-out')) as {
        updated?: number;
        rowsScanned?: number;
        errors?: string[];
        errorCount?: number;
        message?: string;
      };
      const errHint =
        body.errorCount && body.errorCount > 0
          ? ` Предупреждений: ${body.errorCount}.`
          : '';
      toast({
        title: 'Импорт из OUT',
        description:
          (body.message ? `${body.message} ` : '') +
          `Обновлено инициатив: ${body.updated ?? 0} (строк просмотрено: ${body.rowsScanned ?? 0}).${errHint}`,
      });
      if (body.errors?.length) {
        console.warn('[GoogleSheets OUT]', body.errors);
      }
      onAfterImport?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Ошибка импорта из OUT',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPullOut(false);
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        disabled={pushIn}
        onClick={runPushIn}
      >
        {pushIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
        Коэфф. → IN
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        disabled={pullOut}
        onClick={runPullOut}
      >
        {pullOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
        Стоимость ← OUT
      </Button>
      <span className="text-xs text-muted-foreground hidden lg:inline max-w-xl">
        Portfolio export/import — см. docs/GOOGLE_SHEETS_SYNC.md · IN/OUT —{' '}
        <span className="whitespace-nowrap">docs/GOOGLE_SHEETS_IN_OUT.md</span>
      </span>
    </div>
  );
}
