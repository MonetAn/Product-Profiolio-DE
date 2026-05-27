import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CrossInitiativesBundle } from '@/lib/crossInitiativeModel';
import { membersForCross } from '@/lib/crossInitiativeModel';

interface LinkDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: CrossInitiativesBundle | undefined;
  sourceLabel: string;
  targetLabel: string;
  onPickCross: (crossId: string) => void;
  onCreateNew: (name: string) => void;
  busy?: boolean;
}

export function LinkDestinationDialog({
  open,
  onOpenChange,
  bundle,
  sourceLabel,
  targetLabel,
  onPickCross,
  onCreateNew,
  busy,
}: LinkDestinationDialogProps) {
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const crosses = bundle?.crossInitiatives ?? [];
  const members = bundle?.members ?? [];

  const handleClose = (o: boolean) => {
    if (!o) {
      setShowNew(false);
      setNewName('');
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Куда объединить?</DialogTitle>
          <DialogDescription className="text-left space-y-1">
            <span className="block truncate">
              <span className="text-muted-foreground">1:</span> {sourceLabel}
            </span>
            <span className="block truncate">
              <span className="text-muted-foreground">2:</span> {targetLabel}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto py-1">
          {crosses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет кросс-инициатив — создайте новую.</p>
          ) : (
            crosses.map((c) => {
              const n = membersForCross(c.id, members).length;
              return (
                <Button
                  key={c.id}
                  type="button"
                  variant="outline"
                  className="justify-start h-auto py-2"
                  disabled={busy}
                  onClick={() => onPickCross(c.id)}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                    {n} иниц.
                  </span>
                </Button>
              );
            })
          )}
        </div>

        {showNew ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название новой кросс-инициативы"
            autoFocus
          />
        ) : (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setShowNew(true)}>
            Новая кросс-инициатива
          </Button>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Отмена
          </Button>
          {showNew && (
            <Button
              type="button"
              disabled={!newName.trim() || busy}
              onClick={() => {
                onCreateNew(newName.trim());
                setNewName('');
                setShowNew(false);
              }}
            >
              Создать и связать
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
