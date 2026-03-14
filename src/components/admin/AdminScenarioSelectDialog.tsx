import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTeamsForUnits } from '@/lib/adminDataManager';
import type { AdminDataRow } from '@/lib/adminDataManager';

export type ScenarioMode = 'quick' | 'full';

interface AdminScenarioSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ScenarioMode;
  units: string[];
  rawData: AdminDataRow[];
  onConfirm: (unit: string, teams: string[]) => void;
}

export function AdminScenarioSelectDialog({
  open,
  onOpenChange,
  mode,
  units,
  rawData,
  onConfirm,
}: AdminScenarioSelectDialogProps) {
  const [unit, setUnit] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const teamsForUnit = unit ? getTeamsForUnits(rawData, [unit]) : [];

  useEffect(() => {
    if (open) {
      setUnit('');
      setSelectedTeam('');
      setSelectedTeams([]);
    }
  }, [open]);

  useEffect(() => {
    if (!unit) {
      setSelectedTeam('');
      setSelectedTeams([]);
    }
  }, [unit]);

  const handleConfirm = () => {
    if (mode === 'quick') {
      if (unit && selectedTeam) {
        onConfirm(unit, [selectedTeam]);
        onOpenChange(false);
      }
    } else {
      if (unit && selectedTeams.length > 0) {
        onConfirm(unit, selectedTeams);
        onOpenChange(false);
      }
    }
  };

  const canConfirm =
    unit &&
    (mode === 'quick' ? !!selectedTeam : selectedTeams.length > 0);

  const toggleTeam = (t: string) => {
    setSelectedTeams((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const title =
    mode === 'quick'
      ? 'Заполнить информацию на следующие кварталы'
      : 'Открыть полную таблицу';
  const description =
    mode === 'quick'
      ? 'Выберите Unit и одну команду — откроется быстрый ввод процентов по кварталу.'
      : 'Выберите Unit и одну или несколько команд — откроется таблица инициатив.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите юнит" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unit && (
            <div className="space-y-2">
              <Label>{mode === 'quick' ? 'Команда' : 'Команды'}</Label>
              {mode === 'quick' ? (
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите команду" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamsForUnit.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t || '—'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto space-y-2">
                  {teamsForUnit.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedTeams.includes(t)}
                        onCheckedChange={() => toggleTeam(t)}
                      />
                      <span>{t || '—'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {mode === 'quick' ? 'Заполнить усилия' : 'Открыть таблицу'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
