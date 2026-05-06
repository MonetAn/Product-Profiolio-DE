import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
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
  onGeoChange: (initiativeId: string, split: GeoCostSplit | undefined) => void;
  compactChrome?: boolean;
};

const GEO_WIZARD_SESSION_PREFIX = 'portfolio-hub-geo-wizard:';

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
  compactChrome = false,
}: Props) {
  const eligibleRows = useMemo(
    () => rows.filter((r) => quickFlowPaidQuartersForRow(r, fillQuarters).length > 0),
    [rows, fillQuarters]
  );

  const eligibleKey = useMemo(() => eligibleRows.map((r) => r.id).join('|'), [eligibleRows]);

  const [wizardIndex, setWizardIndex] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(`${GEO_WIZARD_SESSION_PREFIX}${eligibleKey}`)
          : null;
      if (raw == null) {
        setWizardIndex(0);
        return;
      }
      const n = parseInt(raw, 10);
      const max = Math.max(0, eligibleRows.length - 1);
      if (Number.isNaN(n) || n < 0) setWizardIndex(0);
      else setWizardIndex(Math.min(n, max));
    } catch {
      setWizardIndex(0);
    }
  }, [eligibleKey, eligibleRows.length]);

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(`${GEO_WIZARD_SESSION_PREFIX}${eligibleKey}`, String(wizardIndex));
    } catch {
      /* ignore */
    }
  }, [eligibleKey, wizardIndex]);

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

  const pctTotal = row ? geoCostSplitPercentsTotal(row.initiativeGeoCostSplit?.entries ?? []) : 0;

  const allGeoComplete = row ? isQuickFlowGeoCompleteForRow(row, fillQuarters) : false;

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет инициатив для команды.</p>;
  }

  if (eligibleRows.length === 0) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {!compactChrome ? (
          <h2 className="text-lg font-semibold">Распредели по странам стоимость инициативы</h2>
        ) : null}
        <p className="text-sm text-muted-foreground">
          В выбранном интервале нет кварталов с ненулевой стоимостью по инициативам этой команды. Распределение не
          требуется.
        </p>
      </section>
    );
  }

  const initiativeTitle = row.initiative?.trim() || 'Без названия';

  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col gap-3', compactChrome ? 'w-full' : 'flex-1')}>
      {!compactChrome ? (
        <h2 className="shrink-0 text-lg font-semibold">Распредели по странам стоимость инициативы</h2>
      ) : null}

      <div
        ref={scrollAreaRef}
        className={cn(
          'flex min-h-0 min-w-0 flex-col gap-4 pr-0.5',
          compactChrome
            ? ''
            : 'flex-1 overflow-y-auto overscroll-contain'
        )}
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
                  <span className="text-xs text-muted-foreground">Стоимость в интервале</span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {Math.round(totalPaidCost).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-xs text-muted-foreground">Заполнение</span>
                  <span
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      allGeoComplete || pctTotal === 100
                        ? 'text-emerald-600 dark:text-emerald-500'
                        : 'text-red-600 dark:text-red-500'
                    )}
                    title={allGeoComplete ? 'Сумма процентов по рынкам = 100%' : `Сумма процентов: ${pctTotal}%`}
                  >
                    {pctTotal}%
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
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm/5">
            <GeoCostSplitEditor
              cost={Math.round(totalPaidCost)}
              value={row.initiativeGeoCostSplit}
              countries={countries}
              onChange={(next) => onGeoChange(row.id, next)}
              hideFooterCostLine
              hidePercentTotalLine
              bulkAddQuarterLabel="инициатива"
              lockMarketSelection
            />
          </div>
        )}
      </div>
    </section>
  );
}
