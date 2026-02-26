import { useState, useCallback, useMemo } from 'react';
import { Upload, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parsePeopleCSV, ParsedPerson } from '@/lib/peopleDataManager';
import { usePeopleMutations } from '@/hooks/usePeople';
import { useSnapshotMutations, getCurrentQuarter } from '@/hooks/useTeamSnapshots';

interface CSVPeopleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingUnits: string[];
  existingTeams: string[];
  quarters: string[];
}

export default function CSVPeopleImportDialog({
  open,
  onOpenChange,
  existingUnits,
  existingTeams,
  quarters,
}: CSVPeopleImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [parsedPeople, setParsedPeople] = useState<ParsedPerson[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());
  
  const { importPeople } = usePeopleMutations();
  const { createSnapshot } = useSnapshotMutations();

  // Available quarters for selection (current + next 4)
  const availableQuarters = useMemo(() => {
    const current = getCurrentQuarter();
    const allQuarters = new Set([...quarters, current]);
    
    // Add next 4 quarters from current
    const [year, q] = current.split('-Q').map(Number);
    for (let i = 1; i <= 4; i++) {
      const newQ = ((q - 1 + i) % 4) + 1;
      const newYear = year + Math.floor((q - 1 + i) / 4);
      allQuarters.add(`${newYear}-Q${newQ}`);
    }
    
    return [...allQuarters].sort();
  }, [quarters]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseErrors(['Пожалуйста, выберите файл .csv']);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parsePeopleCSV(text, existingUnits, existingTeams);
      
      if (result.errors.length > 0) {
        setParseErrors(result.errors);
        return;
      }
      
      setParsedPeople(result.people);
      setParseWarnings(result.warnings);
      setParseErrors([]);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  }, [existingUnits, existingTeams]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    // 1. Import people to DB
    const importedPeople = await importPeople.mutateAsync(parsedPeople);
    
    // 2. Group imported people by unit/team and create snapshots
    const groupedByTeam = new Map<string, string[]>();
    
    for (const person of importedPeople || []) {
      if (person.unit && person.team) {
        const key = `${person.unit}::${person.team}`;
        const existing = groupedByTeam.get(key) || [];
        existing.push(person.id);
        groupedByTeam.set(key, existing);
      }
    }
    
    // Create snapshots for each unit/team combination
    for (const [key, personIds] of groupedByTeam) {
      const [unit, team] = key.split('::');
      await createSnapshot.mutateAsync({
        unit,
        team,
        quarter: selectedQuarter,
        person_ids: personIds,
        source: 'csv_import'
      });
    }
    
    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setStep('upload');
    setParsedPeople([]);
    setParseErrors([]);
    setParseWarnings([]);
    setSelectedQuarter(getCurrentQuarter());
  };

  const handleClose = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const peopleWithWarnings = parsedPeople.filter(p => p.parseWarnings.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Импорт сотрудников из CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' 
              ? 'Загрузите CSV-файл с данными сотрудников из HR-системы'
              : `Проверьте данные перед импортом (${parsedPeople.length} сотрудников)`
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            {/* Quarter selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Квартал для импорта</label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableQuarters.map(q => (
                    <SelectItem key={q} value={q}>
                      {q.replace('20', '').replace('-', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Снимок состава команды будет привязан к этому кварталу
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`
                border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFile(file);
                };
                input.click();
              }}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium mb-1">Перетащите CSV-файл сюда</p>
              <p className="text-sm text-muted-foreground">или нажмите для выбора</p>
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            {parseErrors.map((err, i) => (
              <p key={i} className="text-sm text-destructive">{err}</p>
            ))}
          </div>
        )}

        {step === 'preview' && (
          <>
            {parseWarnings.length > 0 && (
              <div className="p-3 bg-accent border border-border rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  {parseWarnings.map((w, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{w}</p>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="h-[300px] border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left p-2">ФИО</th>
                    <th className="text-left p-2">Unit</th>
                    <th className="text-left p-2">Команда</th>
                    <th className="text-left p-2">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPeople.slice(0, 50).map((person, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{person.full_name}</td>
                      <td className="p-2 text-muted-foreground">{person.unit || '—'}</td>
                      <td className="p-2 text-muted-foreground">{person.team || '—'}</td>
                      <td className="p-2">
                        {person.parseWarnings.length > 0 ? (
                          <Badge variant="outline" className="text-primary border-primary/30">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {person.parseWarnings.length}
                          </Badge>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedPeople.length > 50 && (
                <p className="p-2 text-center text-muted-foreground text-sm">
                  ... и ещё {parsedPeople.length - 50} сотрудников
                </p>
              )}
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Назад
              </Button>
              <Button 
                onClick={handleImport}
                disabled={importPeople.isPending}
              >
                {importPeople.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Импорт...
                  </>
                ) : (
                  <>Импортировать {parsedPeople.length} сотрудников</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
