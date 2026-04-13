import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  type GeoCostSplit,
  type GeoCostSplitEntry,
  geoCostSplitPercentsTotal,
  rubleAmountsForGeoSplit,
  marketClusterKeyLabel,
  MARKET_COUNTRY_CLUSTER_KEYS,
  splitTotalIntoIntegerParts,
} from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { cn } from '@/lib/utils';

type Props = {
  cost: number;
  value: GeoCostSplit | undefined;
  onChange: (next: GeoCostSplit | undefined) => void;
  countries: MarketCountryRow[];
  disabled?: boolean;
  className?: string;
  /** Пояснение к строке сплита (необязательно). */
  showEntryNotes?: boolean;
  /** Не дублировать строку «Стоимость квартала» внизу (если блок встроен в карточку квартала). */
  hideFooterCostLine?: boolean;
  /** Подпись квартала для заголовка диалога массового добавления (например «2026-Q1»). */
  bulkAddQuarterLabel?: string;
};

function emptySplit(): GeoCostSplit {
  return { entries: [] };
}

function selectCountryId(entry: GeoCostSplitEntry, drinkitRowId: string | null): string {
  if (entry.kind === 'country') return entry.countryId;
  if (entry.kind === 'cluster' && entry.clusterKey === 'Drinkit' && drinkitRowId) return drinkitRowId;
  return '';
}

/** Id страны в справочнике, если строка однозначно к нему относится (для дублей в массовом добавлении). */
function effectiveCountryId(e: GeoCostSplitEntry, drinkitRowId: string | null): string | null {
  if (e.kind === 'country') return e.countryId;
  if (e.kind === 'cluster' && e.clusterKey === 'Drinkit' && drinkitRowId) return drinkitRowId;
  return null;
}

function usedCountryIds(entries: GeoCostSplitEntry[], drinkitRowId: string | null): Set<string> {
  const s = new Set<string>();
  for (const e of entries) {
    const id = effectiveCountryId(e, drinkitRowId);
    if (id) s.add(id);
  }
  return s;
}

function groupCountriesByCluster(rows: MarketCountryRow[]): Map<string, MarketCountryRow[]> {
  const m = new Map<string, MarketCountryRow[]>();
  for (const c of rows) {
    if (!c.is_active) continue;
    const k = c.cluster_key;
    const arr = m.get(k) ?? [];
    arr.push(c);
    m.set(k, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru'));
  }
  return m;
}

function clusterKeysOrdered(byCluster: Map<string, MarketCountryRow[]>): string[] {
  const knownOrder = new Set<string>(MARKET_COUNTRY_CLUSTER_KEYS);
  const known = MARKET_COUNTRY_CLUSTER_KEYS.filter((k) => byCluster.has(k));
  const rest = [...byCluster.keys()].filter((k) => !knownOrder.has(k));
  rest.sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

type BulkDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  countries: MarketCountryRow[];
  usedIds: Set<string>;
  onConfirm: (ids: string[]) => void;
  quarterLabel?: string;
};

function GeoCostSplitBulkAddDialog({
  open,
  onOpenChange,
  countries,
  usedIds,
  onConfirm,
  quarterLabel,
}: BulkDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const byCluster = useMemo(() => groupCountriesByCluster(countries), [countries]);
  const clusterKeys = useMemo(() => clusterKeysOrdered(byCluster), [byCluster]);

  const addableIds = useMemo(
    () => countries.filter((c) => c.is_active && !usedIds.has(c.id)).map((c) => c.id),
    [countries, usedIds]
  );

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const addableSet = useMemo(() => new Set(addableIds), [addableIds]);

  const toggleId = useCallback((id: string) => {
    if (!addableSet.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [addableSet]);

  const clusterAddableIds = useCallback(
    (clusterKey: string) =>
      (byCluster.get(clusterKey) ?? []).filter((c) => addableSet.has(c.id)).map((c) => c.id),
    [byCluster, addableSet]
  );

  const toggleCluster = useCallback(
    (clusterKey: string) => {
      const ids = clusterAddableIds(clusterKey);
      if (ids.length === 0) return;
      setSelected((prev) => {
        const next = new Set(prev);
        const allOn = ids.every((id) => next.has(id));
        if (allOn) ids.forEach((id) => next.delete(id));
        else ids.forEach((id) => next.add(id));
        return next;
      });
    },
    [clusterAddableIds]
  );

  const selectAllAddable = useCallback(() => {
    setSelected(new Set(addableIds));
  }, [addableIds]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleConfirm = () => {
    const ids = [...selected].filter((id) => addableSet.has(id));
    onConfirm(ids);
    onOpenChange(false);
  };

  const quarterTrimmed = quarterLabel?.trim();
  const dialogTitle = quarterTrimmed
    ? `В какие страны бьёт эта фича в ${quarterTrimmed}`
    : 'В какие страны бьёт эта фича';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!flex max-h-[90vh] w-[min(100vw-1.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none'
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug">{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 flex flex-col gap-2 border-b border-border px-5 py-3">
          <p className="text-[11px] font-medium text-muted-foreground">Быстрый выбор по кластеру</p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={selectAllAddable}>
              Все доступные
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
              Снять выбор
            </Button>
            {clusterKeys.map((ck) => {
              const ids = clusterAddableIds(ck);
              if (ids.length === 0) return null;
              const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
              return (
                <Button
                  key={ck}
                  type="button"
                  size="sm"
                  variant={allOn ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => toggleCluster(ck)}
                >
                  {marketClusterKeyLabel(ck)}
                  <span className="ml-1 tabular-nums opacity-70">({ids.length})</span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <ul className="space-y-4">
            {clusterKeys.map((ck) => {
              const list = (byCluster.get(ck) ?? []).filter((c) => !usedIds.has(c.id));
              if (list.length === 0) return null;
              return (
                <li key={ck}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{marketClusterKeyLabel(ck)}</p>
                  <ul className="space-y-1.5">
                    {list.map((c) => {
                      const checked = selected.has(c.id);
                      return (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleId(c.id)}
                              className="mt-0.5"
                              aria-label={c.label_ru}
                            />
                            <span className="text-sm leading-snug">{c.label_ru}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Выбрано: <span className="font-medium text-foreground">{selected.size}</span>
            {addableIds.length === 0 ? (
              <span className="ml-2 text-amber-600 dark:text-amber-500">Нет строк для добавления</span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="button" size="sm" onClick={handleConfirm} disabled={selected.size === 0}>
              Добавить выбранные
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GeoCostSplitEditor({
  cost,
  value,
  onChange,
  countries,
  disabled,
  className,
  showEntryNotes = false,
  hideFooterCostLine = false,
  bulkAddQuarterLabel,
}: Props) {
  const split = value?.entries?.length ? value : emptySplit();
  const totalPct = geoCostSplitPercentsTotal(split.entries);
  const rubles = useMemo(
    () => (cost > 0 && split.entries.length ? rubleAmountsForGeoSplit(cost, split.entries) : []),
    [cost, split.entries]
  );

  const drinkitRowId = useMemo(
    () => countries.find((c) => c.cluster_key === 'Drinkit')?.id ?? null,
    [countries]
  );

  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmEvenOpen, setConfirmEvenOpen] = useState(false);

  const usedIds = useMemo(() => usedCountryIds(split.entries, drinkitRowId), [split.entries, drinkitRowId]);

  const setEntries = (entries: GeoCostSplitEntry[]) => {
    if (entries.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ entries });
  };

  const appendCountries = (ids: string[]) => {
    const seen = usedCountryIds(split.entries, drinkitRowId);
    const toAdd = ids.filter((id) => !seen.has(id));
    if (toAdd.length === 0) return;
    const newEntries: GeoCostSplitEntry[] = toAdd.map((countryId) => ({
      kind: 'country',
      countryId,
      percent: 0,
    }));
    setEntries([...split.entries, ...newEntries]);
  };

  const applyEven100 = () => {
    const n = split.entries.length;
    if (n === 0) return;
    const parts = splitTotalIntoIntegerParts(100, n);
    const next = split.entries.map((e, i) => ({ ...e, percent: parts[i] ?? 0 }));
    setEntries(next);
    setConfirmEvenOpen(false);
  };

  const applyRemainderEven = () => {
    const entries = split.entries;
    const n = entries.length;
    if (n === 0) return;
    const sum = geoCostSplitPercentsTotal(entries);
    const rem = 100 - sum;
    if (rem <= 0) return;

    const zeroIdx = entries.map((e, i) => (e.percent === 0 ? i : -1)).filter((i) => i >= 0);

    if (zeroIdx.length > 0) {
      const parts = splitTotalIntoIntegerParts(rem, zeroIdx.length);
      const next = entries.map((e, i) => {
        const zi = zeroIdx.indexOf(i);
        if (zi < 0) return e;
        return { ...e, percent: parts[zi] ?? 0 };
      });
      setEntries(next);
      return;
    }

    const adds = splitTotalIntoIntegerParts(rem, n);
    const next = entries.map((e, i) => ({
      ...e,
      percent: e.percent + (adds[i] ?? 0),
    }));
    setEntries(next);
  };

  const removeAt = (index: number) => {
    const next = split.entries.filter((_, i) => i !== index);
    setEntries(next);
  };

  const updateEntry = (index: number, patch: Partial<GeoCostSplitEntry>) => {
    const next = split.entries.map((e, i) => {
      if (i !== index) return e;
      return { ...e, ...patch } as GeoCostSplitEntry;
    });
    setEntries(next);
  };

  const remainder = 100 - totalPct;
  const canRemainder = split.entries.length > 0 && remainder > 0;

  if (cost <= 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        При нулевой стоимости квартала распределение не задаётся.
      </p>
    );
  }

  const catalogBlocked =
    split.entries.some(
      (e) => e.kind === 'cluster' && e.clusterKey === 'Drinkit' && !drinkitRowId
    ) && !disabled;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="gap-1"
          disabled={disabled || countries.filter((c) => c.is_active).length === 0}
          onClick={() => setBulkOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить страны…
        </Button>
      </div>

      {split.entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || split.entries.length === 0}
            onClick={() => setConfirmEvenOpen(true)}
          >
            100% поровну
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !canRemainder}
            title={
              remainder <= 0
                ? 'Нет положительного остатка до 100%'
                : 'Распределить остаток поровну: сначала между строками с 0%, иначе добавить ко всем строкам'
            }
            onClick={applyRemainderEven}
          >
            Остаток поровну
            {canRemainder ? (
              <span className="ml-1 tabular-nums text-muted-foreground">(+{remainder}%)</span>
            ) : null}
          </Button>
        </div>
      ) : null}

      <GeoCostSplitBulkAddDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        countries={countries}
        usedIds={usedIds}
        onConfirm={appendCountries}
        quarterLabel={bulkAddQuarterLabel}
      />

      <AlertDialog open={confirmEvenOpen} onOpenChange={setConfirmEvenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Разделить 100% поровну?</AlertDialogTitle>
            <AlertDialogDescription>
              Все текущие проценты будут заменены на равные целые доли (сумма 100%). Ручные значения исчезнут.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={applyEven100}>Заменить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {catalogBlocked ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          В справочнике «Рынки» нет строки Drinkit — добавьте её или пересохраните сплит после миграции БД.
        </p>
      ) : null}

      {split.entries.length === 0 ? null : (
        <ul className="space-y-2">
          {split.entries.map((e, index) => {
            const sid = selectCountryId(e, drinkitRowId);
            const legacyClusterNoCatalog =
              e.kind === 'cluster' && e.clusterKey === 'Drinkit' && !drinkitRowId;
            return (
              <li
                key={`${e.kind}-${index}-${e.kind === 'country' ? e.countryId : e.clusterKey}`}
                className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[10rem] flex-1 space-y-1">
                    <span className="text-xs text-muted-foreground">Страна / рынок</span>
                    <Select
                      value={sid || undefined}
                      onValueChange={(id) =>
                        updateEntry(index, {
                          kind: 'country',
                          countryId: id,
                          percent: e.percent,
                          note: e.note,
                        })
                      }
                      disabled={disabled || legacyClusterNoCatalog}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue
                          placeholder={legacyClusterNoCatalog ? 'Drinkit (нет в справочнике)' : 'Выберите'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label_ru}{' '}
                            <span className="text-muted-foreground">({marketClusterKeyLabel(c.cluster_key)})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {e.kind === 'cluster' && e.clusterKey !== 'Drinkit' ? (
                      <p className="text-xs text-muted-foreground">
                        Устаревшая строка «{e.clusterKey}» — выберите рынок из списка, чтобы сохранить в новом формате.
                      </p>
                    ) : null}
                  </div>
                  <div className="w-24 space-y-1">
                    <span className="text-xs text-muted-foreground">%</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 tabular-nums"
                      disabled={disabled}
                      value={e.percent || ''}
                      onChange={(ev) =>
                        updateEntry(index, {
                          percent: Math.min(100, Math.max(0, parseInt(ev.target.value, 10) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <span className="text-xs text-muted-foreground">₽</span>
                    <div className="flex h-8 items-center text-sm tabular-nums">
                      {rubles[index] != null ? rubles[index].toLocaleString('ru-RU') : '—'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                    aria-label="Удалить строку"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {showEntryNotes ? (
                  <div className="space-y-1 pl-0.5">
                    <label className="text-xs text-muted-foreground" htmlFor={`geo-split-note-${index}`}>
                      Почему такая доля (необязательно)
                    </label>
                    <Textarea
                      id={`geo-split-note-${index}`}
                      rows={2}
                      className="min-h-[2.5rem] resize-y text-sm"
                      disabled={disabled}
                      placeholder="Коротко: логика распределения на этот рынок"
                      value={e.note ?? ''}
                      onChange={(ev) => updateEntry(index, { note: ev.target.value })}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={cn(
            'tabular-nums',
            totalPct === 100 ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'
          )}
        >
          Сумма процентов: {totalPct}% {totalPct === 100 ? '' : '(нужно 100%)'}
        </span>
        {!hideFooterCostLine ? (
          <span className="text-muted-foreground">
            Стоимость квартала: {Math.round(cost).toLocaleString('ru-RU')} ₽
          </span>
        ) : null}
      </div>
    </div>
  );
}
