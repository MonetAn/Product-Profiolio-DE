import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useCSVImport } from '@/hooks/useCSVImport';

type ImportMode = 'full' | 'costOnly';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CSVImportDialog = ({ open, onOpenChange }: CSVImportDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('costOnly');
  const [updateExisting, setUpdateExisting] = useState(false);
  const { importCSV, importCostOnlyCSV, isImporting, progress } = useCSVImport();

  const handleFileSelect = useCallback((file: File) => {
    if (file.name.endsWith('.csv')) {
      setSelectedFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;

    if (importMode === 'costOnly') {
      await importCostOnlyCSV(selectedFile);
    } else {
      await importCSV(selectedFile, { skipDuplicates: true, updateExisting });
    }
    setSelectedFile(null);
    onOpenChange(false);
  }, [selectedFile, importMode, importCSV, importCostOnlyCSV, onOpenChange, updateExisting]);

  const handleClose = useCallback(() => {
    if (!isImporting) {
      setSelectedFile(null);
      onOpenChange(false);
    }
  }, [isImporting, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Импорт из CSV</DialogTitle>
          <DialogDescription>
            {importMode === 'costOnly'
              ? 'Загрузите CSV с колонкой «Инициатива» и кварталами (Q1 25, Q2 25, …). Обновятся только суммы стоимости у существующих инициатив; остальные поля не меняются.'
              : 'Полный импорт: Unit, Team, Initiative и все квартальные данные. Дубликаты по умолчанию пропускаются; «Обновлять существующие» перезаписывает стейкхолдеры и квартальные данные.'}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={importMode}
          onValueChange={(v) => setImportMode(v as ImportMode)}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="costOnly" id="mode-cost" />
            <Label htmlFor="mode-cost" className="cursor-pointer font-normal">
              Только стоимость
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="full" id="mode-full" />
            <Label htmlFor="mode-full" className="cursor-pointer font-normal">
              Полный импорт
            </Label>
          </div>
        </RadioGroup>

        {isImporting ? (
          <div className="py-8 px-4">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="h-6 w-6 text-primary animate-pulse" />
              <span className="font-medium">Импортирование...</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {progress}% завершено
            </p>
          </div>
        ) : selectedFile ? (
          <div className="py-6">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <FileSpreadsheet className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
              >
                Отменить
              </Button>
            </div>
            
            {importMode === 'full' && (
              <>
                <div className="flex items-start gap-2 mt-4 p-3 bg-accent border border-border rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {updateExisting
                      ? 'Существующие инициативы будут обновлены (стейкхолдеры, квартальные данные, поддержка). Новые — добавлены.'
                      : 'Будут добавлены только новые инициативы. Существующие записи не перезаписываются.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="update-existing"
                    checked={updateExisting}
                    onCheckedChange={(v) => setUpdateExisting(v === true)}
                  />
                  <Label htmlFor="update-existing" className="text-sm cursor-pointer">
                    Обновлять существующие инициативы по данным из CSV
                  </Label>
                </div>
              </>
            )}
            {importMode === 'costOnly' && (
              <div className="flex items-start gap-2 mt-4 p-3 bg-accent border border-border rounded-lg">
                <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Совпадение по названию инициативы. Обновляются только поля «Стоимость» по кварталам; поддержка, метрики и прочее не меняются.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
            />
            
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">Перетащите CSV файл сюда</p>
            <p className="text-sm text-muted-foreground mb-4">
              или нажмите для выбора
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Выбрать файл
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            Отмена
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
          >
            Импортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CSVImportDialog;
