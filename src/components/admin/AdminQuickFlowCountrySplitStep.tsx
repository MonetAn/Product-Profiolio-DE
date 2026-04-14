import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import {
  cloneGeoCostSplit,
  geoCostSplitPercentsTotal,
  isQuickFlowGeoCompleteForRow,
  quickFlowPaidQuartersForRow,
  type GeoCostSplit,
} from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  countries: MarketCountryRow[];
  onGeoChange: (initiativeId: string, quarter: string, split: GeoCostSplit | undefined) => void;
};

const navArrowClass = cn(
  'h-14 w-14 shrink-0 rounded-full shadow-md transition-transform',
  'bg-violet-600 text-white hover:bg-violet-700 hover:scale-[1.02] active:scale-[0.98]',
  'dark:bg-violet-600 dark:hover:bg-violet-500',
  'disabled:pointer-events-none disabled:opacity-35 disabled:shadow-none disabled:hover:scale-100'
);

export function AdminQuickFlowCountrySplitStep({
  rows,
  fillQuarters,
  countries,
  onGeoChange,
}: Props) {
  const eligibleRows = useMemo(
    () => rows.filter((r) => quickFlowPaidQuartersForRow(r, fillQuarters).length > 0),
    [rows, fillQuarters]
  );

  const eligibleKey = useMemo(() => eligibleRows.map((r) => r.id).join('|'), [eligibleRows]);

  const [wizardIndex, setWizardIndex] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWizardIndex(0);
  }, [eligibleKey]);

  const row = eligibleRows[Math.min(wizardIndex, Math.max(0, eligibleRows.length - 1))];

  useEffect(() => {
    if (!row?.id) return;
    const el = scrollAreaRef.current;
    if (el) el.scrollTop = 0;
  }, [row?.id]);

  const paidQuarters = useMemo(
    () => (row ? quickFlowPaidQuartersForRow(row, fillQuarters) : []),
    [row, fillQuarters]
  );

  const totalPaidCost = useMemo(() => {
    if (!row) return 0;
    return paidQuarters.reduce((s, q) => s + (row.quarterlyData[q]?.cost ?? 0), 0);
  }, [row, paidQuarters]);

  const rubleWeightedGeoPct = useMemo(() => {
    if (!row || paidQuarters.length === 0) return 0;
    let total = 0;
    let weighted = 0;
    for (const q of paidQuarters) {
      const cost = row.quarterlyData[q]?.cost ?? 0;
      if (cost <= 0) continue;
      total += cost;
      const pct = geoCostSplitPercentsTotal(row.quarterlyData[q]?.geoCostSplit?.entries ?? []);
      weighted += cost * (Math.min(100, pct) / 100);
    }
    if (total <= 0) return 0;
    return Math.round((weighted / total) * 100);
  }, [row, paidQuarters]);

  const allGeoComplete = row ? isQuickFlowGeoCompleteForRow(row, fillQuarters) : false;

  const formatMetric = (v: string) => (v?.trim() ? v : '—');

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет инициатив для команды.</p>;
  }

  if (eligibleRows.length === 0) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-lg font-semibold">Распредели по странам стоимость инициативы</h2>
        <p className="text-sm text-muted-foreground">
          В выбранном интервале нет кварталов с ненулевой стоимостью по инициативам этой команды. Распределение не
          требуется.
        </p>
      </section>
    );
  }

  const initiativeTitle = row.initiative?.trim() || 'Без названия';

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <h2 className="shrink-0 text-lg font-semibold">Распредели по странам стоимость инициативы</h2>

      <div
        ref={scrollAreaRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-0.5"
      >
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm/10">
          <div className="flex items-start gap-2 sm:gap-4">
            <Button
              type="button"
              variant="default"
              size="icon"
              className={navArrowClass}
              disabled={wizardIndex <= 0}
              title="Предыдущая инициатива"
              aria-label="Предыдущая инициатива"
              onClick={() => setWizardIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="h-8 w-8" strokeWidth={2.5} aria-hidden />
            </Button>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-medium text-muted-foreground">
                Инициатива{' '}
                <span className="tabular-nums text-muted-foreground/90">
                  · {wizardIndex + 1} из {eligibleRows.length}
                </span>
              </p>
              <p className="mt-0.5 text-xl font-semibold leading-snug tracking-tight text-foreground">
                {initiativeTitle}
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-xs text-muted-foreground">Стоимость</span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {Math.round(totalPaidCost).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-xs text-muted-foreground">Заполнение</span>
                  <span
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      allGeoComplete || rubleWeightedGeoPct === 100
                        ? 'text-emerald-600 dark:text-emerald-500'
                        : 'text-red-600 dark:text-red-500'
                    )}
                    title={
                      allGeoComplete
                        ? 'По всем кварталам с затратами сумма процентов по рынкам = 100%'
                        : `Взвешенная по рублям заполненность: ${rubleWeightedGeoPct}% (нужно 100% по каждому кварталу с затратами)`
                    }
                  >
                    {rubleWeightedGeoPct}%
                  </span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="default"
              size="icon"
              className={navArrowClass}
              disabled={wizardIndex >= eligibleRows.length - 1}
              title="Следующая инициатива"
              aria-label="Следующая инициатива"
              onClick={() => setWizardIndex((i) => Math.min(eligibleRows.length - 1, i + 1))}
            >
              <ChevronRight className="h-8 w-8" strokeWidth={2.5} aria-hidden />
            </Button>
          </div>
        </div>

        {paidQuarters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет кварталов с затратами по этой инициативе в выбранном интервале.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {paidQuarters.map((q, qIdx) => {
              const qd: AdminQuarterData = {
                cost: 0,
                otherCosts: 0,
                support: false,
                onTrack: true,
                metricPlan: '',
                metricFact: '',
                comment: '',
                effortCoefficient: 0,
                ...row.quarterlyData[q],
              };
              const cost = qd.cost ?? 0;
              const quarterPctTotal = geoCostSplitPercentsTotal(qd.geoCostSplit?.entries ?? []);
              const prevQ = qIdx > 0 ? paidQuarters[qIdx - 1] : null;
              const prevSplit = prevQ ? row.quarterlyData[prevQ]?.geoCostSplit : undefined;
              const canCopyFromPrev = Boolean(prevQ && prevSplit?.entries?.length);

              return (
                <div
                  key={q}
                  id={`country-split-${row.id}-${q}`}
                  className="scroll-mt-4 rounded-xl border border-border bg-card p-4 shadow-sm/5"
                >
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border/60 pb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Квартал</p>
                      <p className="text-lg font-semibold tabular-nums leading-none">{q}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-lg font-semibold tabular-nums leading-none',
                        quarterPctTotal === 100
                          ? 'text-emerald-600 dark:text-emerald-500'
                          : 'text-red-600 dark:text-red-500'
                      )}
                      title={
                        quarterPctTotal === 100
                          ? 'Сумма процентов по рынкам: 100%'
                          : `Сумма процентов: ${quarterPctTotal}%, нужно 100%`
                      }
                    >
                      {quarterPctTotal}%
                    </span>
                  </div>
                  <div className="mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    {prevQ ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canCopyFromPrev}
                        title={
                          canCopyFromPrev
                            ? `Скопировать рынки и проценты из ${prevQ}`
                            : `В квартале ${prevQ} ещё нет распределения`
                        }
                        onClick={() => {
                          if (!canCopyFromPrev) return;
                          onGeoChange(row.id, q, cloneGeoCostSplit(prevSplit));
                        }}
                      >
                        Скопировать из {prevQ}
                      </Button>
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      Стоимость квартала:{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        {Math.round(cost).toLocaleString('ru-RU')} ₽
                      </span>
                    </span>
                  </div>
                  <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">План (метрика)</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{formatMetric(qd.metricPlan)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Факт (метрика)</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{formatMetric(qd.metricFact)}</p>
                    </div>
                  </div>
                  <GeoCostSplitEditor
                    cost={cost}
                    value={qd.geoCostSplit}
                    countries={countries}
                    onChange={(next) => onGeoChange(row.id, q, next)}
                    hideFooterCostLine
                    hidePercentTotalLine
                    bulkAddQuarterLabel={q}
                    lockMarketSelection
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
