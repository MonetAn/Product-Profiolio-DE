import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, GripVertical } from 'lucide-react';
import { LogoLoader } from '@/components/LogoLoader';
import AdminHeader from '@/components/admin/AdminHeader';
import { useAccess } from '@/hooks/useAccess';
import {
  useMarketCountries,
  useMarketCountryMutations,
  type MarketCountryRow,
} from '@/hooks/useMarketCountries';
import {
  MARKET_COUNTRY_CLUSTER_KEYS,
  marketClusterKeyLabel,
} from '@/lib/adminDataManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function reorderRows<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function AdminMarkets() {
  const { isAdmin } = useAccess();
  const { toast } = useToast();
  const { data: rows = [], isLoading, error } = useMarketCountries({ includeInactive: isAdmin });
  const { insert, update } = useMarketCountryMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [newCluster, setNewCluster] = useState<string>(MARKET_COUNTRY_CLUSTER_KEYS[0]);
  const [newLabel, setNewLabel] = useState('');

  const dragFromRef = useRef<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const maxSort = useMemo(() => rows.reduce((m, r) => Math.max(m, r.sort_order), 0), [rows]);

  const persistOrder = useCallback(
    async (ordered: MarketCountryRow[]) => {
      setIsReordering(true);
      try {
        await Promise.all(
          ordered.map((r, i) =>
            update.mutateAsync({ id: r.id, patch: { sort_order: (i + 1) * 10 } })
          )
        );
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Не удалось сохранить порядок',
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setIsReordering(false);
      }
    },
    [update, toast]
  );

  const handleDropOnRow = useCallback(
    (dropIndex: number) => {
      const from = dragFromRef.current;
      dragFromRef.current = null;
      if (from === null || from === dropIndex) return;
      const next = reorderRows(rows, from, dropIndex);
      void persistOrder(next);
    },
    [rows, persistOrder]
  );

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) {
      toast({ variant: 'destructive', title: 'Укажите название страны' });
      return;
    }
    try {
      await insert.mutateAsync({
        cluster_key: newCluster,
        label_ru: label,
        sort_order: maxSort + 10,
        is_active: true,
      });
      toast({ title: 'Страна добавлена' });
      setAddOpen(false);
      setNewLabel('');
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось сохранить',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    try {
      await update.mutateAsync({ id, patch: { is_active } });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось обновить',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const saveRow = async (id: string, patch: { cluster_key?: string; label_ru?: string }) => {
    try {
      await update.mutateAsync({ id, patch });
      toast({ title: 'Сохранено' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <AdminHeader currentView="markets" hasData={false} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <LogoLoader />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <AdminHeader currentView="markets" hasData={false} />
        <div className="min-h-0 flex-1 overflow-y-auto p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Ошибка загрузки'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AdminHeader currentView="markets" hasData />
      <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Globe2 className="h-6 w-6 text-primary" aria-hidden />
              Рынки: страны и кластеры
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Справочник для распределения стоимости по странам. Порядок строк меняется перетаскиванием за иконку
              слева. Неактивные строки сохраняют ссылки в уже сохранённых данных.
            </p>
          </div>
          {isAdmin ? (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              Добавить страну
            </Button>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin ? <TableHead className="w-10" aria-label="Порядок" /> : null}
                <TableHead>Кластер</TableHead>
                <TableHead>Страна (RU)</TableHead>
                <TableHead className="w-28">Активна</TableHead>
                {isAdmin ? <TableHead className="w-36" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => (
                <MarketRow
                  key={r.id}
                  index={index}
                  row={r}
                  isAdmin={isAdmin}
                  reorderDisabled={isReordering || update.isPending}
                  onDragRowStart={() => {
                    dragFromRef.current = index;
                  }}
                  onDragRowEnd={() => {
                    dragFromRef.current = null;
                  }}
                  onRowDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onRowDrop={() => handleDropOnRow(index)}
                  onToggleActive={(v) => void toggleActive(r.id, v)}
                  onSave={(patch) => void saveRow(r.id, patch)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Новая страна</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Кластер</Label>
              <Select value={newCluster} onValueChange={setNewCluster}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_COUNTRY_CLUSTER_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {marketClusterKeyLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mc-label">Название</Label>
              <Input
                id="mc-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Например, Германия"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Позиция в списке задаётся автоматически в конце; при необходимости перетащите строку выше или ниже.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleAdd()} disabled={insert.isPending}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MarketRow({
  row,
  index,
  isAdmin,
  reorderDisabled,
  onDragRowStart,
  onDragRowEnd,
  onRowDragOver,
  onRowDrop,
  onToggleActive,
  onSave,
}: {
  row: MarketCountryRow;
  index: number;
  isAdmin: boolean;
  reorderDisabled: boolean;
  onDragRowStart: () => void;
  onDragRowEnd: () => void;
  onRowDragOver: (e: React.DragEvent) => void;
  onRowDrop: () => void;
  onToggleActive: (v: boolean) => void;
  onSave: (patch: { cluster_key?: string; label_ru?: string }) => void;
}) {
  const [cluster, setCluster] = useState(row.cluster_key);
  const [label, setLabel] = useState(row.label_ru);

  useEffect(() => {
    setCluster(row.cluster_key);
    setLabel(row.label_ru);
  }, [row.cluster_key, row.label_ru]);

  const dirty = cluster !== row.cluster_key || label !== row.label_ru;

  return (
    <TableRow
      className={cn(!row.is_active && 'opacity-60')}
      onDragOver={isAdmin ? onRowDragOver : undefined}
      onDrop={isAdmin ? onRowDrop : undefined}
    >
      {isAdmin ? (
        <TableCell className="w-10 p-2 align-middle">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Перетащить строку ${index + 1}`}
            draggable={!reorderDisabled}
            className={cn(
              'flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing',
              reorderDisabled && 'pointer-events-none opacity-40'
            )}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
              onDragRowStart();
            }}
            onDragEnd={onDragRowEnd}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
            }}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </div>
        </TableCell>
      ) : null}
      <TableCell>
        {isAdmin ? (
          <Select value={cluster} onValueChange={setCluster}>
            <SelectTrigger className="h-8 max-w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKET_COUNTRY_CLUSTER_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {marketClusterKeyLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          marketClusterKeyLabel(row.cluster_key)
        )}
      </TableCell>
      <TableCell>
        {isAdmin ? (
          <Input className="h-8 max-w-xs" value={label} onChange={(e) => setLabel(e.target.value)} />
        ) : (
          row.label_ru
        )}
      </TableCell>
      <TableCell>
        <Switch checked={row.is_active} onCheckedChange={onToggleActive} disabled={!isAdmin} />
      </TableCell>
      {isAdmin ? (
        <TableCell>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!dirty}
            onClick={() => {
              onSave({
                cluster_key: cluster,
                label_ru: label.trim(),
              });
            }}
          >
            Сохранить
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
