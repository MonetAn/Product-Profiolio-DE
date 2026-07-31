import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBudget } from '@/lib/dataManager';
import {
  buildInitiativeQuarterCashFlowForecast,
  computeInitiativePayback,
  computeInitiativePlanningForecastSeries,
  computeInitiativeQuarterCashFlowForecast,
  computePlanningForecastBreakdown,
  formatPaybackRubAmount,
  formatPaybackRatio,
  formatRoiPercent,
  formatQuarterHuman,
  paybackSummaryTitle,
  paybackToneClass,
  type InitiativeQuarterCashFlowForecast,
  type InitiativePaybackQuarter,
  type PlanningForecastQuarterLine,
} from '@/lib/initiativePayback';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import '@/styles/initiative-payback-panel.css';

interface InitiativePaybackRevenueTotalProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
  className?: string;
  size?: 'xs' | 'sm';
}

/** Основной финансовый показатель за выбранный период. */
export function InitiativePaybackRevenueTotal({
  quarterlyData,
  selectedQuarters,
  className,
  size = 'sm',
}: InitiativePaybackRevenueTotalProps) {
  const summary = useMemo(
    () => computeInitiativePayback(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  if (!summary || (summary.periodRevenue <= 0 && summary.periodGrossRevenue <= 0)) {
    return null;
  }

  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-[12px]';
  const title = paybackSummaryTitle(summary);
  const hasProfit = summary.periodRevenue > 0;
  const value = hasProfit ? summary.periodRevenue : summary.periodGrossRevenue;
  const label = hasProfit ? 'Прибыль' : 'Выручка';

  return (
    <span
      className={cn(
        'gantt-payback-revenue-total font-medium',
        hasProfit
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-sky-700 dark:text-sky-400',
        sizeClass,
        className
      )}
      title={title}
    >
      {label} +{formatBudget(value)}
    </span>
  );
}

function formatDeltaHint(delta: number, label: string): string | null {
  if (delta === 0) return null;
  const sign = delta > 0 ? '+' : '−';
  return `${label} ${sign}${formatPaybackRubAmount(Math.abs(delta))}`;
}

function formatSignedRub(value: number): string {
  if (value > 0) return `+${formatPaybackRubAmount(value)}`;
  if (value < 0) return `−${formatPaybackRubAmount(Math.abs(value))}`;
  return '0 ₽';
}

/** Более короткая сумма для узкого квартального блока; точная сумма остаётся в подсказке. */
function formatCashFlowBlockRub(value: number): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';

  if (abs >= 1_000_000) {
    const millions = Math.round((abs / 1_000_000) * 10) / 10;
    const amount = Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
    return `${sign}${amount} млн ₽`;
  }

  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)} тыс ₽`;
  }

  return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₽`;
}

interface QuarterCashFlowStripProps {
  forecast: InitiativeQuarterCashFlowForecast;
  previousLines: PlanningForecastQuarterLine[] | null;
  ariaLabel: string;
  compact?: boolean;
}

function QuarterCashFlowStrip({
  forecast,
  previousLines,
  ariaLabel,
  compact = false,
}: QuarterCashFlowStripProps) {
  const prevByTarget = useMemo(() => {
    const map = new Map<string, PlanningForecastQuarterLine>();
    for (const line of previousLines ?? []) {
      map.set(line.targetQuarter, line);
    }
    return map;
  }, [previousLines]);

  return (
    <div
      className={cn(
        'initiative-payback-quarter-strip',
        compact && 'initiative-payback-quarter-strip-compact'
      )}
      role="list"
      aria-label={ariaLabel}
      style={{
        gridTemplateColumns: `repeat(${forecast.lines.length}, minmax(${compact ? 88 : 104}px, 1fr))`,
      }}
    >
      {forecast.lines.map((line) => {
        const prev = prevByTarget.get(line.targetQuarter);
        const revenueDelta = prev ? line.revenueRub - prev.revenueRub : null;
        const grossRevenueDelta = prev
          ? (line.grossRevenueRub ?? 0) - (prev.grossRevenueRub ?? 0)
          : null;
        const costDelta = prev ? line.costRub - prev.costRub : null;
        const isNew = !prev;
        const isPositive = line.cumulativeNetRub > 0;
        const isNegative = line.cumulativeNetRub < 0;
        const deltaHints = previousLines
          ? isNew
            ? ['Новый квартал в прогнозе']
            : [
                formatDeltaHint(revenueDelta ?? 0, 'прибыль'),
                formatDeltaHint(grossRevenueDelta ?? 0, 'выручка'),
                formatDeltaHint(costDelta ?? 0, 'расходы'),
              ].filter((hint): hint is string => Boolean(hint))
          : [];

        return (
          <Tooltip key={line.targetQuarter} delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="listitem"
                className={cn(
                  'initiative-payback-quarter-block',
                  isPositive && 'initiative-payback-quarter-block-positive',
                  isNegative && 'initiative-payback-quarter-block-negative',
                  !isPositive && !isNegative && 'initiative-payback-quarter-block-neutral'
                )}
                aria-label={`${formatQuarterHuman(line.targetQuarter)}: итог на конец квартала ${formatSignedRub(line.cumulativeNetRub)}`}
              >
                <span className="initiative-payback-quarter-label">
                  На конец {formatQuarterHuman(line.targetQuarter)}
                </span>
                <span className="initiative-payback-quarter-result">
                  <strong>{formatCashFlowBlockRub(line.cumulativeNetRub)}</strong>
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="center"
              className="initiative-payback-quarter-tooltip"
            >
              <p className="initiative-payback-quarter-tooltip-title">
                {formatQuarterHuman(line.targetQuarter)}
              </p>
              <div className="initiative-payback-quarter-tooltip-grid">
                <span>Прибыль за квартал</span>
                <strong>+{formatPaybackRubAmount(line.revenueRub)}</strong>
                <span>Выручка за квартал</span>
                <strong>+{formatPaybackRubAmount(line.grossRevenueRub ?? 0)}</strong>
                <span>Расходы за квартал</span>
                <strong>−{formatPaybackRubAmount(line.costRub)}</strong>
                <span>Результат квартала</span>
                <strong>{formatSignedRub(line.netRub)}</strong>
              </div>
              <div className="initiative-payback-quarter-tooltip-total">
                <span>Итого на конец квартала</span>
                <strong>{formatSignedRub(line.cumulativeNetRub)}</strong>
              </div>
              {deltaHints.length > 0 ? (
                <p className="initiative-payback-quarter-tooltip-delta">
                  К прошлому прогнозу: {deltaHints.join(' · ')}
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface ForecastBreakdownProps {
  lines: PlanningForecastQuarterLine[];
  previousLines: PlanningForecastQuarterLine[] | null;
  planningQuarterLabel: string;
}

function ForecastBreakdown({ lines, previousLines, planningQuarterLabel }: ForecastBreakdownProps) {
  const forecast = useMemo(() => buildInitiativeQuarterCashFlowForecast(lines), [lines]);
  if (!forecast) return null;

  return (
    <div className="gantt-detail-payback-breakdown">
      <p className="gantt-detail-payback-breakdown-title">
        Прогноз на конец {planningQuarterLabel}
      </p>
      <QuarterCashFlowStrip
        forecast={forecast}
        previousLines={previousLines}
        ariaLabel={`Денежный результат по кварталам в прогнозе на конец ${planningQuarterLabel}`}
        compact
      />
    </div>
  );
}

interface InitiativePaybackQuarterHistoryPanelProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
  className?: string;
  variant?: 'gantt' | 'peek';
}

function sectionLabelClass(variant: 'gantt' | 'peek'): string {
  return variant === 'peek'
    ? 'text-sm font-medium text-muted-foreground mb-2'
    : 'gantt-detail-panel-label';
}

interface InitiativePaybackCurrentSummaryProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
}

/** Текущий накопительный денежный результат за выбранный период. */
export function InitiativePaybackCurrentSummary({
  quarterlyData,
  selectedQuarters,
}: InitiativePaybackCurrentSummaryProps) {
  const forecast = useMemo(
    () => computeInitiativeQuarterCashFlowForecast(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  if (!forecast) return null;

  const ratioLabel =
    forecast.ratio != null
      ? formatRoiPercent(forecast.ratio)
      : forecast.grossRevenueToCostRatio != null
        ? formatPaybackRatio(forecast.grossRevenueToCostRatio)
        : '—';
  const ratioTitle =
    forecast.ratio != null ? 'ROI' : 'Выручка / затраты';

  return (
    <section className="initiative-payback-forecast-section">
      <div className="initiative-payback-current-card">
        <div className="initiative-payback-current-head">
          <p className="initiative-payback-current-totals">
            <span>
              Прибыль <strong>{formatPaybackRubAmount(forecast.periodRevenue)}</strong>
            </span>
            <span className="initiative-payback-current-totals-sep">/</span>
            <span>
              Выручка{' '}
              <strong>{formatPaybackRubAmount(forecast.periodGrossRevenue)}</strong>
            </span>
            <span className="initiative-payback-current-totals-sep">/</span>
            <span>
              Затраты <strong>{formatPaybackRubAmount(forecast.periodCost)}</strong>
            </span>
          </p>
          <span className="initiative-payback-current-ratio-wrap">
            <span className="initiative-payback-current-ratio-label">{ratioTitle}</span>
            <strong
              className={cn(
                'initiative-payback-current-ratio tabular-nums',
                forecast.ratio != null
                  ? paybackToneClass(forecast.isPaidOff)
                  : 'text-sky-700 dark:text-sky-400'
              )}
            >
              {ratioLabel}
            </strong>
          </span>
        </div>
        <QuarterCashFlowStrip
          forecast={forecast}
          previousLines={null}
          ariaLabel="Текущий прогноз денежного результата по кварталам"
        />
      </div>
    </section>
  );
}

interface InitiativePaybackInfoSectionProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
  variant?: 'gantt' | 'peek';
  className?: string;
}

/** Текущий прогноз + история по кварталам (таймлайн и карточка тримэпа). */
export function InitiativePaybackInfoSection({
  quarterlyData,
  selectedQuarters,
  variant = 'peek',
  className,
}: InitiativePaybackInfoSectionProps) {
  const current = useMemo(
    () => computeInitiativeQuarterCashFlowForecast(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );
  const historyPoints = useMemo(
    () => computeInitiativePlanningForecastSeries(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  if (!current && variant !== 'peek' && historyPoints.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {current ? (
        <InitiativePaybackCurrentSummary
          quarterlyData={quarterlyData}
          selectedQuarters={selectedQuarters}
        />
      ) : null}
      {variant === 'peek' || historyPoints.length > 0 ? (
        <InitiativePaybackQuarterHistoryPanel
          quarterlyData={quarterlyData}
          selectedQuarters={selectedQuarters}
          variant={variant}
        />
      ) : null}
    </div>
  );
}

/** История план/факта каждого квартала планирования. */
export function InitiativePaybackQuarterHistoryPanel({
  quarterlyData,
  selectedQuarters,
  className,
  variant = 'gantt',
}: InitiativePaybackQuarterHistoryPanelProps) {
  const [expandedPlanningQuarter, setExpandedPlanningQuarter] = useState<string | null>(null);
  const [historySectionOpen, setHistorySectionOpen] = useState(false);

  const points = useMemo(
    () => computeInitiativePlanningForecastSeries(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  const historyTitle = 'История план/факта каждого квартала';
  const collapsible = variant === 'peek';

  if (points.length === 0 && !collapsible) return null;

  const quarterList =
    points.length > 0 ? (
    <ul className="gantt-detail-payback-history-list">
      {points.map((point, index) => {
        const { planningQuarter, summary, isCurrentPlanningQuarter } = point;
        const expanded = expandedPlanningQuarter === planningQuarter;
        const ratioLabel =
          summary.ratio != null
            ? `ROI ${formatRoiPercent(summary.ratio)}`
            : summary.grossRevenueToCostRatio != null
              ? `Выручка ${formatPaybackRatio(summary.grossRevenueToCostRatio)}`
              : '—';
        const planningLabel = formatQuarterHuman(planningQuarter);

        const breakdown = expanded
          ? computePlanningForecastBreakdown(quarterlyData, selectedQuarters, planningQuarter, {
              isLivePlanningQuarter: isCurrentPlanningQuarter,
            })
          : null;

        const previousPoint = index > 0 ? points[index - 1] : null;
        const previousBreakdown =
          expanded && breakdown && previousPoint
            ? computePlanningForecastBreakdown(
                quarterlyData,
                selectedQuarters,
                previousPoint.planningQuarter,
                { isLivePlanningQuarter: previousPoint.isCurrentPlanningQuarter }
              )
            : null;

        return (
          <li key={planningQuarter} className="gantt-detail-payback-history-block">
            <button
              type="button"
              className={cn(
                'gantt-detail-payback-history-trigger',
                expanded && 'gantt-detail-payback-history-trigger-expanded'
              )}
              onClick={() => setExpandedPlanningQuarter(expanded ? null : planningQuarter)}
              aria-expanded={expanded}
            >
              <span className="gantt-detail-payback-history-trigger-icon" aria-hidden>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span className="gantt-detail-payback-history-trigger-main">
                <span className="gantt-detail-payback-history-quarter">
                  {planningLabel}
                  {isCurrentPlanningQuarter ? (
                    <span className="gantt-detail-payback-history-live">сейчас</span>
                  ) : null}
                </span>
                <span className="gantt-detail-payback-history-totals">
                  Прибыль <strong>{formatPaybackRubAmount(summary.periodRevenue)}</strong>
                  <span className="gantt-detail-payback-history-totals-sep">/</span>
                  Выручка{' '}
                  <strong>{formatPaybackRubAmount(summary.periodGrossRevenue)}</strong>
                  <span className="gantt-detail-payback-history-totals-sep">/</span>
                  Затраты <strong>{formatPaybackRubAmount(summary.periodCost)}</strong>
                </span>
              </span>
              <span
                className={cn(
                  'gantt-detail-payback-history-ratio font-semibold tabular-nums',
                  summary.ratio != null
                    ? paybackToneClass(summary.isPaidOff)
                    : 'text-sky-700 dark:text-sky-400'
                )}
              >
                {ratioLabel}
              </span>
            </button>
            {expanded && breakdown ? (
              <ForecastBreakdown
                lines={breakdown.lines}
                previousLines={previousBreakdown?.lines ?? null}
                planningQuarterLabel={planningLabel}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
    ) : (
      <p className="initiative-payback-history-empty text-sm text-muted-foreground">
        Пока нет записей. Заполните прибыль или выручку по кварталам в админке и
        сохраните — история начнёт копиться с первого изменения.
      </p>
    );

  if (collapsible) {
    return (
      <section className={className}>
        <button
          type="button"
          className="initiative-payback-history-section-toggle"
          onClick={() => setHistorySectionOpen((open) => !open)}
          aria-expanded={historySectionOpen}
        >
          <span className="initiative-payback-history-section-toggle-icon" aria-hidden>
            {historySectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span>{historyTitle}</span>
        </button>
        {historySectionOpen ? (
          <div className="gantt-detail-payback-history initiative-payback-history-section-body">
            {quarterList}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div
      className={cn('gantt-detail-payback-history', 'gantt-detail-panel-section', className)}
    >
      <div className={sectionLabelClass(variant)}>{historyTitle}</div>
      {quarterList}
    </div>
  );
}
