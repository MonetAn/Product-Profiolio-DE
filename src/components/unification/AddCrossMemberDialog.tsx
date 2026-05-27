import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { getUnitColor } from '@/lib/dataManager';

interface AddCrossMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crossName: string;
  allInitiatives: AdminDataRow[];
  /** Уже в этой кросс-инициативе */
  memberInitiativeIds: Set<string>;
  onAddMembers: (initiativeIds: string[]) => Promise<void>;
  adding?: boolean;
}

export function AddCrossMemberDialog({
  open,
  onOpenChange,
  crossName,
  allInitiatives,
  memberInitiativeIds,
  onAddMembers,
  adding,
}: AddCrossMemberDialogProps) {
  const [query, setQuery] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery('');
      setPendingIds(new Set());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allInitiatives.filter((r) => {
      if (!q) return true;
      return (
        r.initiative.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        (r.team || '').toLowerCase().includes(q)
      );
    });

    return filtered
      .sort((a, b) => {
        const aMember = memberInitiativeIds.has(a.id);
        const bMember = memberInitiativeIds.has(b.id);
        if (aMember !== bMember) return aMember ? 1 : -1;
        return a.initiative.localeCompare(b.initiative, 'ru');
      })
      .slice(0, 100);
  }, [allInitiatives, memberInitiativeIds, query]);

  const pendingCount = pendingIds.size;
  const hasPending = pendingCount > 0;

  const resetAndClose = useCallback(() => {
    setQuery('');
    setPendingIds(new Set());
    setDiscardOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const requestClose = useCallback(() => {
    if (hasPending) {
      setDiscardOpen(true);
    } else {
      resetAndClose();
    }
  }, [hasPending, resetAndClose]);

  const togglePending = useCallback((id: string) => {
    if (memberInitiativeIds.has(id)) return;
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [memberInitiativeIds]);

  const handleSave = useCallback(async () => {
    if (pendingIds.size === 0 || adding) return;
    const ids = [...pendingIds];
    await onAddMembers(ids);
    resetAndClose();
  }, [pendingIds, adding, onAddMembers, resetAndClose]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
      >
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle>Добавить участников</DialogTitle>
            <DialogDescription className="text-left">
              Выберите одну или несколько инициатив для «{crossName}». Доли по всем
              кросс-инициативам каждой инициативы пересчитаются при сохранении.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Поиск по названию, юниту, команде…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <ul className="max-h-[min(50vh,360px)] overflow-y-auto divide-y divide-border">
            {results.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted-foreground text-center">
                {query.trim() ? 'Ничего не найдено' : 'Нет инициатив в каталоге'}
              </li>
            ) : (
              results.map((row) => {
                const isMember = memberInitiativeIds.has(row.id);
                const isPending = pendingIds.has(row.id);

                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={adding || isMember}
                      className={cn(
                        'w-full text-left px-5 py-3 transition-colors flex gap-3 items-center',
                        isMember
                          ? 'opacity-70 cursor-default bg-muted/30'
                          : 'hover:bg-secondary/60',
                        isPending && !isMember && 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                      )}
                      onClick={() => togglePending(row.id)}
                    >
                      <span
                        className="w-1 h-9 rounded-full shrink-0"
                        style={{ backgroundColor: getUnitColor(row.unit) }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium block truncate">{row.initiative}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.unit} · {row.team || 'Без команды'}
                        </span>
                      </span>
                      {isMember ? (
                        <span className="text-xs text-muted-foreground shrink-0">Уже добавлена</span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1 text-xs text-primary shrink-0 font-medium">
                          <Check className="h-3.5 w-3.5" />
                          Выбрана
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">Выбрать</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {hasPending ? `Выбрано: ${pendingCount}` : 'Отметьте инициативы в списке'}
            </span>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="ghost" size="sm" disabled={adding} onClick={requestClose}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!hasPending || adding}
                onClick={() => void handleSave()}
              >
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Сохранение…
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              Выбрано инициатив: {pendingCount}. Они не будут добавлены в кросс-инициативу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardOpen(false)}>Продолжить выбор</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={resetAndClose}>
              Закрыть
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
