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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface QuickAddInitiativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextQuarter: string;
  onSubmit: (initiativeName: string, effortPercent: number) => void;
}

export default function QuickAddInitiativeDialog({
  open,
  onOpenChange,
  nextQuarter,
  onSubmit,
}: QuickAddInitiativeDialogProps) {
  const [name, setName] = useState('');
  const [effort, setEffort] = useState<number>(0);

  useEffect(() => {
    if (open) {
      setName('');
      setEffort(0);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, effort);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Новая инициатива</DialogTitle>
          <DialogDescription>
            Добавить инициативу с процентом усилий на {nextQuarter}. Остальное можно заполнить в полной таблице.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="quick-init-name">Название инициативы *</Label>
            <Input
              id="quick-init-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-init-effort">% усилий на {nextQuarter}</Label>
            <Input
              id="quick-init-effort"
              type="number"
              min={0}
              max={100}
              value={effort === 0 ? '' : effort}
              onChange={(e) => setEffort(parseInt(e.target.value, 10) || 0)}
              placeholder="0"
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
