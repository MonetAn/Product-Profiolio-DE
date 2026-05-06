import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  type GeoCostSplit,
  type GeoCostSplitEntry,
  geoCostSplitPercentsTotal,
  rubleAmountsForGeoSplit,
  marketClusterKeyLabel,
  MARKET_COUNTRY_CLUSTER_KEYS,
  splitTotalIntoIntegerParts,
} from '@/lib/adminDataManager';
import {
  applyGeoDriverToSplitEntries,
  buildDriverReferenceTable,
  formatDriverQuantityDisplay,
  formatDriverReferencePercent,
  GEO_ALLOCATION_DRIVERS,
  getDriverDefByStorageKey,
  getDriverQuantityForLabel,
} from '@/lib/geoAllocationDrivers';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { cn } from '@/lib/utils';

type Props = {
  cost: number;
  value: GeoCostSplit | undefined;
  onChange: (next: GeoCostSplit | undefined) => void;
  countries: MarketCountryRow[];
  disabled?: boolean;
  className?: string;
  /** Один комментарий на весь сплит квартала — под списком стран (по умолчанию включён). */
  showQuarterNote?: boolean;
  /** Не дублировать строку «Стоимость квартала» внизу (если блок встроен в карточку квартала). */
  hideFooterCostLine?: boolean;
  /** Скрыть строку «Сумма процентов» внизу (если показываете её рядом с заголовком квартала). */
  hidePercentTotalLine?: boolean;
  /** Суффикс id для поля комментария к сплиту квартала (например «2026-Q1»), если несколько редакторов на экране. */
  bulkAddQuarterLabel?: string;
  /** Нельзя менять рынок в строке — только удалить или добавить через «Добавить рынки» (новые строки сверху). */
  lockMarketSelection?: boolean;
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

function labelRuForGeoEntry(
  e: GeoCostSplitEntry,
  countries: MarketCountryRow[],
  drinkitRowId: string | null
): string | null {
  if (e.kind === 'country') {
    return countries.find((x) => x.id === e.countryId)?.label_ru ?? null;
  }
  if (e.kind === 'cluster' && e.clusterKey === 'Drinkit' && drinkitRowId) {
    return countries.find((x) => x.id === drinkitRowId)?.label_ru ?? null;
  }
  return null;
}

function entryRowLabel(
  e: GeoCostSplitEntry,
  countries: MarketCountryRow[],
  drinkitRowId: string | null
): string {
  if (e.kind === 'cluster') {
    if (e.clusterKey === 'Drinkit' && drinkitRowId) {
      const c = countries.find((x) => x.id === drinkitRowId);
      return c
        ? `${c.label_ru} (${marketClusterKeyLabel(c.cluster_key)})`
        : 'Drinkit';
    }
    return marketClusterKeyLabel(e.clusterKey);
  }
  const c = countries.find((x) => x.id === e.countryId);
  return c ? `${c.label_ru} (${marketClusterKeyLabel(c.cluster_key)})` : e.countryId;
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
};

function GeoCostSplitBulkAddDialog({
  open,
  onOpenChange,
  countries,
  usedIds,
  onConfirm,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!flex max-h-[90vh] w-[min(100vw-1.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none'
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug">
            В какие рынки бьёт эта фича
          </DialogTitle>
        </DialogHeader>

        <div className="shrink-0 flex flex-wrap gap-2 border-b border-border px-5 py-3">
          <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={selectAllAddable}>
            Все доступные
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
            Снять выбор
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <ul className="space-y-4">
            {clusterKeys.map((ck) => {
              const list = (byCluster.get(ck) ?? []).filter((c) => !usedIds.has(c.id));
              if (list.length === 0) return null;
              const clusterIds = clusterAddableIds(ck);
              const clusterSelectedCount = clusterIds.filter((id) => selected.has(id)).length;
              const clusterAllOn =
                clusterIds.length > 0 && clusterIds.every((id) => selected.has(id));
              const clusterSomeOn = clusterSelectedCount > 0 && !clusterAllOn;
              return (
                <li key={ck}>
                  <button
                    type="button"
                    className={cn(
                      'mb-1.5 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs font-medium transition-colors',
                      clusterIds.length === 0
                        ? 'cursor-default text-muted-foreground'
                        : 'text-foreground hover:bg-muted/60',
                      (clusterAllOn || clusterSomeOn) && 'border-primary/35 bg-primary/5'
                    )}
                    disabled={clusterIds.length === 0}
                    title={
                      clusterIds.length === 0
                        ? undefined
                        : clusterAllOn
                          ? `Снять выбор со всех стран кластера «${marketClusterKeyLabel(ck)}»`
                          : `Выбрать все страны кластера «${marketClusterKeyLabel(ck)}»`
                    }
                    onClick={() => toggleCluster(ck)}
                  >
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border',
                        clusterAllOn || clusterSomeOn
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/50 bg-background text-transparent'
                      )}
                      aria-hidden
                    >
                      {clusterAllOn ? <Check className="h-3 w-3" /> : null}
                      {clusterSomeOn ? <Minus className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{marketClusterKeyLabel(ck)}</span>
                    <span className="shrink-0 tabular-nums text-[11px] font-normal text-muted-foreground">
                      {clusterSelectedCount}/{clusterIds.length}
                    </span>
                  </button>
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
  showQuarterNote = true,
  hideFooterCostLine = false,
  hidePercentTotalLine = false,
  bulkAddQuarterLabel,
  lockMarketSelection = false,
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
  const { toast } = useToast();

  const usedIds = useMemo(() => usedCountryIds(split.entries, drinkitRowId), [split.entries, drinkitRowId]);

  const countriesById = useMemo(() => new Map(countries.map((c) => [c.id, c])), [countries]);

  const activeDriverDef = useMemo(() => getDriverDefByStorageKey(value?.driverKey), [value?.driverKey]);

  const [driverCatalogOpen, setDriverCatalogOpen] = useState(false);
  useEffect(() => {
    if (!value?.driverKey) setDriverCatalogOpen(false);
  }, [value?.driverKey]);

  const driverReferenceRows = useMemo(
    () => (activeDriverDef ? buildDriverReferenceTable(activeDriverDef, countries) : []),
    [activeDriverDef, countries]
  );

  const driverQuantityColumnVisible = Boolean(activeDriverDef);
  const revenueDriverDef = useMemo(
    () => GEO_ALLOCATION_DRIVERS.find((d) => d.key === 'geo_driver_revenue'),
    []
  );

  const driverQuantityColClass = useMemo(() => {
    if (!activeDriverDef) return 'w-[3.75rem] shrink-0';
    return activeDriverDef.quantityKind === 'money'
      ? 'min-w-[6rem] w-[7rem] max-w-[9rem] shrink-0'
      : 'w-[3.75rem] shrink-0 sm:w-16';
  }, [activeDriverDef]);

  const driverColumnExplainer = useMemo(() => {
    if (!activeDriverDef) return '';
    return activeDriverDef.quantityKind === 'money'
      ? 'Справочная база в пресете, ₽; проценты в сплите считаются по долям пресета в %, не по этой сумме. Справа — ₽ квартала.'
      : 'Справочное количество в пресете; проценты в сплите — по долям пресета в % (не из этих штук). Справа — ₽ квартала.';
  }, [activeDriverDef]);

  const commitSplit = useCallback(
    (entries: GeoCostSplitEntry[], options?: { clearDriver?: boolean }) => {
      const keepNote = typeof value?.note === 'string' && value.note.length > 0 ? value.note : undefined;
      if (entries.length === 0) {
        onChange(undefined);
        return;
      }
      const driverFields =
        options?.clearDriver || !value?.driverKey
          ? {}
          : {
              ...(typeof value.driverKey === 'string' && value.driverKey.trim()
                ? { driverKey: value.driverKey.trim() }
                : {}),
              ...(typeof value.driverLabel === 'string' && value.driverLabel.trim()
                ? { driverLabel: value.driverLabel.trim() }
                : {}),
            };
      onChange({
        entries,
        ...driverFields,
        ...(keepNote ? { note: keepNote } : {}),
      });
    },
    [onChange, value?.note, value?.driverKey, value?.driverLabel]
  );

  const updateSplitNote = useCallback(
    (text: string) => {
      const entries = value?.entries;
      if (!entries?.length) return;
      onChange({
        entries,
        ...(typeof value?.driverKey === 'string' && value.driverKey.trim()
          ? { driverKey: value.driverKey.trim() }
          : {}),
        ...(typeof value?.driverLabel === 'string' && value.driverLabel.trim()
          ? { driverLabel: value.driverLabel.trim() }
          : {}),
        ...(text.length > 0 ? { note: text } : {}),
      });
    },
    [onChange, value?.entries, value?.driverKey, value?.driverLabel]
  );

  const appendCountries = (ids: string[]) => {
    const seen = usedCountryIds(split.entries, drinkitRowId);
    const toAdd = ids.filter((id) => !seen.has(id));
    if (toAdd.length === 0) return;
    const newEntries: GeoCostSplitEntry[] = toAdd.map((countryId) => ({
      kind: 'country',
      countryId,
      percent: 0,
    }));
    commitSplit(lockMarketSelection ? [...newEntries, ...split.entries] : [...split.entries, ...newEntries]);
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
      commitSplit(next, { clearDriver: true });
      return;
    }

    const adds = splitTotalIntoIntegerParts(rem, n);
    const next = entries.map((e, i) => ({
      ...e,
      percent: e.percent + (adds[i] ?? 0),
    }));
    commitSplit(next, { clearDriver: true });
  };

  const applyDriverPreset = (d: (typeof GEO_ALLOCATION_DRIVERS)[number]) => {
    if (split.entries.length === 0) return;
    if (split.entries.some((e) => e.kind === 'cluster')) {
      toast({
        title: 'Нужны строки-страны',
        description:
          'Уберите legacy-строку кластера — оставьте только страны из справочника рынков, затем снова нажмите драйвер.',
      });
      return;
    }
    const next = applyGeoDriverToSplitEntries(split.entries, countriesById, d);
    if (!next) {
      toast({
        title: 'Нет весов для этих рынков',
        description:
          'Для выбранных строк нет коэффициентов в этом драйвере (или все нули). Добавьте страны из справочника или задайте доли вручную.',
      });
      return;
    }
    const keepNote = typeof value?.note === 'string' && value.note.length > 0 ? value.note : undefined;
    onChange({
      entries: next,
      driverKey: d.key,
      driverLabel: d.fullLabel,
      ...(keepNote ? { note: keepNote } : {}),
    });
  };

  const applyGlobalRevenuePreset = (includeDrinkit: boolean) => {
    if (!revenueDriverDef) return;
    const available = countries
      .filter((c) => c.is_active)
      .filter((c) => (includeDrinkit ? true : c.cluster_key !== 'Drinkit'))
      .sort((a, b) => (a.sort_order ?? 100000) - (b.sort_order ?? 100000) || a.label_ru.localeCompare(b.label_ru, 'ru'));
    if (available.length === 0) {
      toast({
        title: 'Нет рынков для пресета',
        description: includeDrinkit
          ? 'В справочнике нет активных рынков для выбора.'
          : 'Нет активных рынков вне Drinkit.',
      });
      return;
    }

    const entries: GeoCostSplitEntry[] = available.map((c) => ({
      kind: 'country',
      countryId: c.id,
      percent: 0,
    }));
    const next = applyGeoDriverToSplitEntries(entries, countriesById, revenueDriverDef);
    if (!next) {
      toast({
        title: 'Не удалось применить выручку',
        description: 'Для выбранного набора рынков не найдены веса по выручке.',
      });
      return;
    }

    const keepNote = typeof value?.note === 'string' && value.note.length > 0 ? value.note : undefined;
    onChange({
      entries: next,
      driverKey: revenueDriverDef.key,
      driverLabel: revenueDriverDef.fullLabel,
      ...(keepNote ? { note: keepNote } : {}),
    });
  };

  const removeAt = (index: number) => {
    const next = split.entries.filter((_, i) => i !== index);
    commitSplit(next);
  };

  const updateEntry = (index: number, patch: Partial<GeoCostSplitEntry>) => {
    const next = split.entries.map((e, i) => {
      if (i !== index) return e;
      return { ...e, ...patch } as GeoCostSplitEntry;
    });
    commitSplit(next);
  };

  const remainder = 100 - totalPct;
  const canRemainder = split.entries.length > 0 && remainder > 0;
  const hasClusterRow = split.entries.some((e) => e.kind === 'cluster');
  const canApplyDrivers =
    split.entries.length > 0 && !hasClusterRow && !disabled;

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
          Добавить рынки
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !revenueDriverDef}
          onClick={() => applyGlobalRevenuePreset(true)}
        >
          Global: Pizza + Drinkit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !revenueDriverDef}
          onClick={() => applyGlobalRevenuePreset(false)}
        >
          Global: Pizza only
        </Button>
      </div>

      {split.entries.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted-foreground">По драйверам:</span>
            {GEO_ALLOCATION_DRIVERS.map((d) => {
              const selected = value?.driverKey === d.key;
              return (
                <Button
                  key={d.key}
                  type="button"
                  size="sm"
                  variant={selected ? 'secondary' : 'outline'}
                  className={cn(
                    'h-7 text-xs',
                    selected && 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/35'
                  )}
                  disabled={!canApplyDrivers}
                  aria-pressed={selected}
                  title={
                    hasClusterRow
                      ? 'Сначала замените строку кластера на страну из справочника'
                      : d.fullLabel
                  }
                  onClick={() => applyDriverPreset(d)}
                >
                  {d.shortLabel}
                </Button>
              );
            })}
          </div>
          {activeDriverDef ? (
            <div className="flex flex-col gap-2">
              <Collapsible open={driverCatalogOpen} onOpenChange={setDriverCatalogOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-fit justify-start gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 shrink-0 transition-transform', driverCatalogOpen && 'rotate-180')}
                    />
                    Логика распределения драйвера
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 rounded-md border border-violet-500/25 bg-violet-500/[0.06] p-3 dark:bg-violet-500/10">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Целые проценты в колонке «%»</span> считаются по{' '}
                    <span className="font-medium text-foreground">долям пресета в процентах</span> (столбец «Доля пресета»
                    ниже) и только для вашего списка рынков перенормируются на 100%. В колонке «Драйвер» — отдельно{' '}
                    <span className="font-medium text-foreground">справочные числа</span> (объекты сети или ₽ по выручке); они
                    для контекста и{' '}
                    <span className="font-medium text-foreground">не подставляются вместо долей %</span>. Колонка «₽»
                    справа — распределение стоимости квартала.
                  </p>
                  <div className="max-h-56 overflow-auto rounded border border-border/60 bg-background/90">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="sticky top-0 border-b border-border/60 bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                          <th className="px-2 py-1.5 font-medium">Рынок</th>
                          <th className="px-2 py-1.5 font-medium">Кластер</th>
                          <th className="px-2 py-1.5 text-right font-medium">
                            {activeDriverDef.quantityKind === 'money' ? 'База, ₽' : 'База, шт.'}
                          </th>
                          <th className="w-[4.5rem] px-2 py-1.5 text-right font-medium">Доля пресета, %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverReferenceRows.map((r) => (
                          <tr key={r.labelRu} className="border-b border-border/40 last:border-0">
                            <td className="px-2 py-1 text-foreground">{r.labelRu}</td>
                            <td className="px-2 py-1 text-muted-foreground">
                              {r.clusterKey === '—' ? '—' : marketClusterKeyLabel(r.clusterKey)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-violet-800 dark:text-violet-200">
                              {formatDriverQuantityDisplay(activeDriverDef, r.quantity)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                              {formatDriverReferencePercent(r.presetPercent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-auto min-h-9 w-fit whitespace-normal text-left leading-snug"
            disabled={disabled || !canRemainder}
            title={
              remainder <= 0
                ? 'Нет положительного остатка до 100%'
                : 'Сначала поровну между странами с 0%, если таких нет — добавить остаток ко всем строкам'
            }
            onClick={applyRemainderEven}
          >
            Остаток поровну между незаполненными странами
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
      />

      {catalogBlocked ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          В справочнике «Рынки» нет строки Drinkit — добавьте её или пересохраните сплит после миграции БД.
        </p>
      ) : null}

      {split.entries.length === 0 ? null : (
        <div className="rounded-lg border border-border/70 bg-muted/15">
          <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 flex-1">Страна / рынок</span>
            {driverQuantityColumnVisible && activeDriverDef ? (
              <span
                className={cn(
                  'flex items-center justify-end pr-0.5 text-violet-600 dark:text-violet-400',
                  driverQuantityColClass
                )}
                title={driverColumnExplainer}
              >
                {activeDriverDef.quantityColumnTitle}
              </span>
            ) : null}
            <span
              className="flex w-[4.25rem] shrink-0 items-center justify-end pr-0.5 sm:w-[4.5rem]"
              title="Доля в этом сплите: целые проценты, в сумме 100%"
            >
              %
            </span>
            <span className="flex w-[5.5rem] shrink-0 items-center justify-end" title="Рубли по стоимости квартала">
              ₽
            </span>
            <span className="inline-flex w-7 shrink-0 justify-center" aria-hidden>
              {/* колонка удаления */}
            </span>
          </div>
          <ul className="divide-y divide-border/50">
            {split.entries.map((e, index) => {
              const sid = selectCountryId(e, drinkitRowId);
              const legacyClusterNoCatalog =
                e.kind === 'cluster' && e.clusterKey === 'Drinkit' && !drinkitRowId;
              const rowLabelRu = labelRuForGeoEntry(e, countries, drinkitRowId);
              const driverQty =
                driverQuantityColumnVisible && activeDriverDef
                  ? getDriverQuantityForLabel(activeDriverDef, rowLabelRu)
                  : undefined;
              return (
                <li
                  key={`${e.kind}-${index}-${e.kind === 'country' ? e.countryId : e.clusterKey}`}
                  className="bg-muted/10 px-2 py-1 first:rounded-t-none last:rounded-b-md"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {lockMarketSelection ? (
                        <div className="flex min-h-8 items-center px-1 text-sm leading-snug text-foreground">
                          <span className="min-w-0">
                            {legacyClusterNoCatalog
                              ? 'Drinkit (нет в справочнике)'
                              : entryRowLabel(e, countries, drinkitRowId)}
                          </span>
                        </div>
                      ) : (
                        <>
                          <Select
                            value={sid || undefined}
                            onValueChange={(id) =>
                              updateEntry(index, {
                                kind: 'country',
                                countryId: id,
                                percent: e.percent,
                              })
                            }
                            disabled={disabled || legacyClusterNoCatalog}
                          >
                            <SelectTrigger className="h-8 border-transparent bg-transparent px-1 shadow-none hover:bg-muted/50">
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
                            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                              Устаревшая строка «{e.clusterKey}» — выберите рынок из списка.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                    {driverQuantityColumnVisible && activeDriverDef ? (
                      <div
                        className={cn(
                          'flex h-9 shrink-0 items-center justify-end rounded-md border border-violet-500/30 bg-violet-500/[0.08] px-1.5 py-0 dark:bg-violet-500/15',
                          driverQuantityColClass
                        )}
                        title={driverColumnExplainer}
                      >
                        <span
                          className={cn(
                            'w-full text-right tabular-nums text-violet-900 dark:text-violet-100',
                            activeDriverDef.quantityKind === 'money' ? 'text-[10px] leading-tight' : 'text-xs'
                          )}
                        >
                          {formatDriverQuantityDisplay(activeDriverDef, driverQty)}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        'flex h-9 w-[4.25rem] shrink-0 items-center gap-0.5 rounded-md border border-input bg-background px-1.5 py-0 shadow-sm sm:w-[4.5rem]',
                        'transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35',
                        disabled && 'pointer-events-none opacity-50'
                      )}
                      title="Доля в сплите: целые проценты (0–100), сумма по строкам 100%"
                    >
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        inputMode="numeric"
                        className="h-7 w-full min-w-0 border-0 bg-transparent p-0 text-right text-sm tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        disabled={disabled}
                        value={String(e.percent)}
                        onChange={(ev) => {
                          const raw = ev.target.value;
                          if (raw === '') {
                            updateEntry(index, { percent: 0 });
                            return;
                          }
                          const n = parseInt(raw, 10);
                          if (Number.isNaN(n)) return;
                          updateEntry(index, { percent: Math.min(100, Math.max(0, n)) });
                        }}
                        aria-label="Процент доли"
                      />
                      <span className="pointer-events-none shrink-0 text-xs font-medium text-muted-foreground">
                        %
                      </span>
                    </div>
                    <div className="flex h-8 w-[5.5rem] shrink-0 items-baseline justify-end gap-0.5 tabular-nums">
                      <span className="min-w-0 truncate text-right text-sm">
                        {rubles[index] != null ? rubles[index].toLocaleString('ru-RU') : '—'}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">₽</span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      disabled={disabled}
                      onClick={() => removeAt(index)}
                      aria-label="Удалить строку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showQuarterNote && split.entries.length > 0 ? (
        <div className="space-y-1.5">
          <label
            className="text-xs text-muted-foreground"
            htmlFor={`geo-split-quarter-note-${bulkAddQuarterLabel ?? 'default'}`}
          >
            Комментарий к распределению (необязательно)
          </label>
          <Textarea
            id={`geo-split-quarter-note-${bulkAddQuarterLabel ?? 'default'}`}
            rows={3}
            className="min-h-[4rem] resize-y text-sm"
            disabled={disabled}
            placeholder="Коротко: логика распределения по этому кварталу"
            value={split.note ?? ''}
            onChange={(ev) => updateSplitNote(ev.target.value)}
          />
        </div>
      ) : null}

      {!hidePercentTotalLine || !hideFooterCostLine ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {!hidePercentTotalLine ? (
            <span
              className={cn(
                'tabular-nums',
                totalPct === 100 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'
              )}
            >
              Сумма процентов: {totalPct}% {totalPct === 100 ? '' : '(нужно 100%)'}
            </span>
          ) : null}
          {!hideFooterCostLine ? (
            <span className="text-muted-foreground">
              Стоимость квартала: {Math.round(cost).toLocaleString('ru-RU')} ₽
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
