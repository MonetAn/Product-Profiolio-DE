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
import { Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useCSVImport } from '@/hooks/useCSVImport';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CSVImportDialog = ({ open, onOpenChange }: CSVImportDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { importCSV, isImporting, progress } = useCSVImport();

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
    
    await importCSV(selectedFile, { skipDuplicates: true });
    setSelectedFile(null);
    onOpenChange(false);
  }, [selectedFile, importCSV, onOpenChange]);

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
            Загрузите файл portfolio.csv для импорта инициатив в базу данных.
            Дублирующиеся записи (по Unit + Team + Initiative) будут пропущены.
          </DialogDescription>
        </DialogHeader>

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
            
            <div className="flex items-start gap-2 mt-4 p-3 bg-accent border border-border rounded-lg">
              <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Это действие добавит новые инициативы в базу данных. Существующие записи не будут перезаписаны.
              </p>
            </div>
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
