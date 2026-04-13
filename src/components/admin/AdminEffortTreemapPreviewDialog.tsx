import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TreemapContainer } from '@/components/treemap';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { createEmptyQuarterData } from '@/lib/adminDataManager';
import type { TreeNode } from '@/lib/dataManager';
import { getUnitColor, mixHexWithNeutralGray } from '@/lib/dataManager';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';

export type AdminEffortTreemapPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filteredData: AdminDataRow[];
  /** Кварталы из каталога матрицы. */
  quarterCandidates: string[];
  /** Стартовый период: выбранные в матрице кварталы (порядок сохраняется, фильтруется по каталогу). */
  defaultQuarters?: string[];
  /** Один квартал по умолчанию, если defaultQuarters не задан. */
  defaultQuarter?: string;
};

const PREVIEW_ROOT_NAME = 'effort-preview-root';

/** Как «нераспределено» на главной — нейтральный серый блок. */
const UNALLOCATED_COLOR = '#94a3b8';

function teamQuarterCostSum(rows: AdminDataRow[], quarter: string): number {
  return rows.reduce((s, row) => {
    const qd = row.quarterlyData[quarter] ?? createEmptyQuarterData();
    return s + (qd.cost ?? 0) + (qd.otherCosts ?? 0);
  }, 0);
}

/** Сумма (стоимость + прочие) по команде за все кварталы периода. */
function teamPeriodCostSum(rows: AdminDataRow[], quarters: string[]): number {
  if (quarters.length === 0) return 0;
  return rows.reduce((acc, row) => {
    let rowSum = 0;
    for (const q of quarters) {
      const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
      rowSum += (qd.cost ?? 0) + (qd.otherCosts ?? 0);
    }
    return acc + rowSum;
  }, 0);
}

/** Средний коэффициент усилий по выбранным кварталам (0–100). */
function meanEffortCoefficient(row: AdminDataRow, quarters: string[]): number {
  if (quarters.length === 0) return 0;
  let s = 0;
  for (const q of quarters) {
    const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
    s += Math.max(0, Math.min(100, Number(qd.effortCoefficient) || 0));
  }
  return s / quarters.length;
}

function parseManualTotal(raw: string): number {
  const t = raw.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function uniqueInitiativeLabel(base: string, used: Map<string, number>): string {
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base} (${n})`;
}

function periodLabel(quarters: string[]): string {
  if (quarters.length === 0) return '—';
  const sorted = [...quarters].sort(compareQuarters);
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} — ${sorted[sorted.length - 1]}`;
}

function yearsFromQuarters(quarters: string[]): string[] {
  const y = new Set<string>();
  for (const q of quarters) {
    const yp = q.split('-')[0];
    if (yp) y.add(yp);
  }
  return [...y].sort();
}

export function AdminEffortTreemapPreviewDialog({
  open,
  onOpenChange,
  filteredData,
  quarterCandidates,
  defaultQuarters,
  defaultQuarter,
}: AdminEffortTreemapPreviewDialogProps) {
  const sortedCandidates = useMemo(
    () => [...quarterCandidates].sort(compareQuarters),
    [quarterCandidates]
  );

  const initialQuarters = useMemo(() => {
    const fromProps = (defaultQuarters ?? [])
      .filter((q) => sortedCandidates.includes(q))
      .sort(compareQuarters);
    if (fromProps.length > 0) return fromProps;
    if (defaultQuarter && sortedCandidates.includes(defaultQuarter)) return [defaultQuarter];
    return sortedCandidates[0] ? [sortedCandidates[0]] : [];
  }, [defaultQuarters, defaultQuarter, sortedCandidates]);

  const [previewQuarters, setPreviewQuarters] = useState<string[]>(initialQuarters);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);
  const [manualTotalStr, setManualTotalStr] = useState('');

  useEffect(() => {
    if (open) {
      setPreviewQuarters(initialQuarters);
      setRangeStart(null);
      setHoverQuarter(null);
      setManualTotalStr('');
    }
  }, [open, initialQuarters]);

  const getRangeBetween = (a: string, b: string) =>
    filterQuartersInRange(a, b, sortedCandidates);

  const handleQuarterClick = (q: string) => {
    if (rangeStart === null) {
      setRangeStart(q);
      setPreviewQuarters([q]);
    } else {
      setPreviewQuarters(getRangeBetween(rangeStart, q));
      setRangeStart(null);
    }
  };

  const isInHoverRange = (q: string) => {
    if (!rangeStart || !hoverQuarter) return false;
    return getRangeBetween(rangeStart, hoverQuarter).includes(q);
  };

  const computedTotal = useMemo(
    () => teamPeriodCostSum(filteredData, previewQuarters),
    [filteredData, previewQuarters]
  );

  const quartersWithCosts = useMemo(() => {
    return sortedCandidates.filter((q) => teamQuarterCostSum(filteredData, q) > 0);
  }, [filteredData, sortedCandidates]);

  const copySourceQuarters = useMemo(() => [...quartersWithCosts], [quartersWithCosts]);

  const usesManualBase = computedTotal <= 0;
  const manualParsed = parseManualTotal(manualTotalStr);
  const effectiveTotal = usesManualBase ? manualParsed : computedTotal;

  const previewModel = useMemo(() => {
    if (previewQuarters.length === 0 || effectiveTotal <= 0) {
      return {
        treeChildren: [] as TreeNode[],
        contentKey: 'empty',
        getPreviewColor: (name: string) =>
          name === 'Нераспределено' ? UNALLOCATED_COLOR : getUnitColor(name),
        sumEffort: 0,
        zeroEffortLabels: [] as string[],
        overflowPct: false,
        note: null as string | null,
      };
    }

    let sumEffortAcc = 0;
    const withPct: { label: string; effort: number; stub: boolean }[] = [];
    const zeroNames: string[] = [];
    const labelUsed = new Map<string, number>();

    for (const row of filteredData) {
      const effort = meanEffortCoefficient(row, previewQuarters);
      const rounded = Math.round(effort * 1000) / 1000;
      const base = row.initiative?.trim() || '—';
      if (rounded > 1e-6) {
        sumEffortAcc += effort;
        withPct.push({
          label: uniqueInitiativeLabel(base, labelUsed),
          effort,
          stub: Boolean(row.isTimelineStub),
        });
      } else {
        zeroNames.push(base);
      }
    }

    const overflow = sumEffortAcc > 100 + 1e-4;
    const treeChildren: TreeNode[] = [];
    const stubNames = new Set<string>();

    const pushLeaf = (name: string, value: number, stub: boolean) => {
      if (value <= 0) return;
      if (stub) stubNames.add(name);
      treeChildren.push({
        name,
        value,
        ...(stub ? { isTimelineStub: true, isInitiative: true } : {}),
      });
    };

    if (overflow) {
      for (const w of withPct) {
        const share = w.effort / sumEffortAcc;
        pushLeaf(w.label, effectiveTotal * share, w.stub);
      }
    } else {
      for (const w of withPct) {
        pushLeaf(w.label, (effectiveTotal * w.effort) / 100, w.stub);
      }
      const restPct = Math.max(0, 100 - sumEffortAcc);
      if (restPct > 1e-4) {
        pushLeaf('Нераспределено', (effectiveTotal * restPct) / 100, false);
      }
    }

    const contentKey = [
      previewQuarters.join(','),
      Math.round(effectiveTotal * 100),
      sumEffortAcc.toFixed(3),
      treeChildren.map((c) => `${c.name}:${Math.round(c.value ?? 0)}`).join('|'),
    ].join('::');

    const note = overflow
      ? 'Сумма средних коэффициентов больше 100% — площади пропорциональны долям, база не меняется.'
      : null;

    const getPreviewColor = (name: string) => {
      if (name === 'Нераспределено') return UNALLOCATED_COLOR;
      const base = getUnitColor(name);
      if (stubNames.has(name)) return mixHexWithNeutralGray(base, 0.48);
      return base;
    };

    return {
      treeChildren,
      contentKey,
      getPreviewColor,
      sumEffort: sumEffortAcc,
      zeroEffortLabels: zeroNames,
      overflowPct: overflow,
      note,
    };
  }, [filteredData, previewQuarters, effectiveTotal]);

  const treeData: TreeNode = useMemo(
    () => ({
      name: PREVIEW_ROOT_NAME,
      isRoot: true,
      children: previewModel.treeChildren,
    }),
    [previewModel.treeChildren]
  );

  const handleCopyFromQuarter = (sourceQ: string) => {
    const v = teamQuarterCostSum(filteredData, sourceQ);
    if (v > 0) setManualTotalStr(String(Math.round(v)));
  };

  const hasSlices = previewModel.treeChildren.length > 0;
  const years = yearsFromQuarters(sortedCandidates);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,880px)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Превью treemap по коэффициентам</DialogTitle>
          <DialogDescription>
            Цвета совпадают с палитрой бюджетного treemap на главной. База — сумма стоимости и прочих расходов
            команды за выбранный период. Коэффициенты усилий усредняются по кварталам периода; «Нераспределено» —
            до 100% по этой сумме. Не сохраняется в базу.
          </DialogDescription>
        </DialogHeader>

        {sortedCandidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет кварталов для превью.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <Label className="text-sm font-medium">Период</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {periodLabel(previewQuarters)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 border-b border-border pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => {
                    setPreviewQuarters([...sortedCandidates]);
                    setRangeStart(null);
                  }}
                >
                  Все кварталы
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => {
                    setPreviewQuarters(sortedCandidates[0] ? [sortedCandidates[0]] : []);
                    setRangeStart(null);
                  }}
                >
                  Сброс
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {rangeStart
                  ? `Второй клик — конец диапазона (начало: ${rangeStart.replace('-', ' ')})`
                  : 'Первый клик — один квартал; второй — диапазон между кварталами'}
              </p>
              <div className="max-h-[11rem] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                {years.map((year) => {
                  const yearQs = sortedCandidates.filter((q) => q.startsWith(year));
                  return (
                    <div key={year}>
                      <div className="mb-1 text-[10px] font-semibold text-muted-foreground">{year}</div>
                      <div className="grid grid-cols-4 gap-1">
                        {yearQs.map((q) => {
                          const qLabel = q.split('-')[1] ?? q;
                          const selected = previewQuarters.includes(q);
                          const isStart = rangeStart === q;
                          const hoverBand = isInHoverRange(q);
                          return (
                            <button
                              key={q}
                              type="button"
                              onClick={() => handleQuarterClick(q)}
                              onMouseEnter={() => setHoverQuarter(q)}
                              onMouseLeave={() => setHoverQuarter(null)}
                              className={`rounded border py-1.5 text-[10px] font-medium tabular-nums transition-colors ${
                                isStart
                                  ? 'border-primary bg-primary text-primary-foreground ring-1 ring-primary/30'
                                  : selected
                                    ? 'border-foreground bg-foreground text-background'
                                    : hoverBand
                                      ? 'border-primary/50 bg-primary/25'
                                      : 'border-border bg-background hover:border-muted-foreground'
                              }`}
                            >
                              <span className="flex items-center justify-center gap-0.5">
                                {selected ? <Check className="h-2.5 w-2.5 shrink-0" aria-hidden /> : null}
                                {qLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {computedTotal > 0 ? (
              <p className="text-sm text-muted-foreground">
                База по данным за <span className="font-medium text-foreground">{periodLabel(previewQuarters)}</span>
                :{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {formatMoney(computedTotal)}
                </span>{' '}
                (сумма стоимости + прочие по команде за период)
              </p>
            ) : (
              <Alert variant="default" className="border-blue-500/40 bg-blue-500/5">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                <AlertTitle className="text-blue-950 dark:text-blue-100">
                  Нет посчитанной суммы за этот период
                </AlertTitle>
                <AlertDescription className="text-blue-950/90 dark:text-blue-50/90">
                  Введите сумму вручную или подставьте сумму за один квартал, где уже есть стоимость.
                </AlertDescription>
              </Alert>
            )}

            {usesManualBase ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effort-treemap-manual">Сумма для превью</Label>
                  <Input
                    id="effort-treemap-manual"
                    inputMode="decimal"
                    placeholder="Например 15000000"
                    value={manualTotalStr}
                    onChange={(e) => setManualTotalStr(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effort-treemap-copy">Сумма из одного квартала</Label>
                  {copySourceQuarters.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет кварталов с ненулевой суммой по команде.</p>
                  ) : (
                    <Select
                      key={`${previewQuarters.join(',')}-${open}`}
                      onValueChange={(v) => handleCopyFromQuarter(v)}
                    >
                      <SelectTrigger id="effort-treemap-copy" className="w-full">
                        <SelectValue placeholder="Подставить сумму…" />
                      </SelectTrigger>
                      <SelectContent>
                        {copySourceQuarters.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q} — {formatMoney(teamQuarterCostSum(filteredData, q))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ) : null}

            {previewModel.overflowPct && previewModel.note ? (
              <p className="text-xs text-blue-700 dark:text-blue-400">{previewModel.note}</p>
            ) : null}

            {effectiveTotal > 0 && hasSlices ? (
              <div className="w-full overflow-hidden rounded-lg border border-border bg-card">
                <div className="h-[380px] min-h-[280px] w-full">
                  <TreemapContainer
                    data={treeData}
                    showTeams={false}
                    showInitiatives={true}
                    hasData={true}
                    selectedQuarters={
                      previewQuarters.length > 0
                        ? [...previewQuarters].sort(compareQuarters)
                        : []
                    }
                    selectedUnitsCount={1}
                    getColor={previewModel.getPreviewColor}
                    showUploadButton={false}
                    showDistributionInTooltip={false}
                    contentKey={previewModel.contentKey}
                    emptyStateTitle="Нет долей для treemap"
                    emptyStateSubtitle="Задайте коэффициенты усилий или проверьте сумму базы"
                    showMoney={true}
                  />
                </div>
                <p className="border-t border-border px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">
                  Всего база: {formatMoney(effectiveTotal)} · сумма средних коэффициентов:{' '}
                  {previewModel.sumEffort.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
                </p>
              </div>
            ) : effectiveTotal > 0 ? (
              <p className="text-sm text-muted-foreground">Нет долей для отображения (все коэффициенты 0%).</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Укажите положительную сумму для превью, чтобы построить treemap.
              </p>
            )}

            {previewModel.zeroEffortLabels.length > 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Без доли в периоде {periodLabel(previewQuarters)} (среднее 0%):{' '}
                </span>
                {previewModel.zeroEffortLabels.slice(0, 12).join(', ')}
                {previewModel.zeroEffortLabels.length > 12
                  ? ` и ещё ${previewModel.zeroEffortLabels.length - 12}…`
                  : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
