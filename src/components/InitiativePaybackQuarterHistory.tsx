import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBudget } from '@/lib/dataManager';
import {
  computeInitiativePayback,
  computeInitiativePlanningForecastSeries,
  computePlanningForecastBreakdown,
  formatPaybackRatio,
  formatQuarterHuman,
  paybackSummaryTitle,
  paybackToneClass,
  type InitiativePaybackQuarter,
  type PlanningForecastQuarterLine,
} from '@/lib/initiativePayback';
import { cn } from '@/lib/utils';
import '@/styles/initiative-payback-panel.css';

interface InitiativePaybackRevenueTotalProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
  className?: string;
  size?: 'xs' | 'sm';
}

/** Сумма прибыли за выбранный период (вместо % от бюджета на экране). */
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

  if (!summary || summary.periodRevenue <= 0) return null;

  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-[12px]';
  const title = paybackSummaryTitle(summary);

  return (
    <span
      className={cn('gantt-payback-revenue-total font-medium text-emerald-700 dark:text-emerald-400', sizeClass, className)}
      title={title}
    >
      +{formatBudget(summary.periodRevenue)}
    </span>
  );
}

function formatDeltaHint(delta: number, label: string): string | null {
  if (delta === 0) return null;
  const sign = delta > 0 ? '+' : '−';
  return `${label} ${sign}${formatBudget(Math.abs(delta))}`;
}

interface ForecastBreakdownProps {
  lines: PlanningForecastQuarterLine[];
  previousLines: PlanningForecastQuarterLine[] | null;
  planningQuarterLabel: string;
}

function ForecastBreakdown({ lines, previousLines, planningQuarterLabel }: ForecastBreakdownProps) {
  const prevByTarget = useMemo(() => {
    const map = new Map<string, PlanningForecastQuarterLine>();
    for (const line of previousLines ?? []) {
      map.set(line.targetQuarter, line);
    }
    return map;
  }, [previousLines]);

  return (
    <div className="gantt-detail-payback-breakdown">
      <p className="gantt-detail-payback-breakdown-title">
        Из чего складывался прогноз на конец {planningQuarterLabel}
      </p>
      <ul className="gantt-detail-payback-breakdown-list">
        {lines.map((line) => {
          const prev = prevByTarget.get(line.targetQuarter);
          const revenueDelta = prev ? line.revenueRub - prev.revenueRub : null;
          const costDelta = prev ? line.costRub - prev.costRub : null;
          const isNew = !prev;

          return (
            <li key={line.targetQuarter} className="gantt-detail-payback-breakdown-row">
              <span className="gantt-detail-payback-breakdown-q">{formatQuarterHuman(line.targetQuarter)}</span>
              <div className="gantt-detail-payback-breakdown-values">
                <span>
                  затраты <strong>{formatBudget(line.costRub)}</strong>
                </span>
                <span>
                  прибыль <strong>{formatBudget(line.revenueRub)}</strong>
                </span>
              </div>
              {(isNew || revenueDelta !== 0 || costDelta !== 0) && previousLines ? (
                <p className="gantt-detail-payback-breakdown-delta">
                  {isNew
                    ? 'впервые заложили в этом квартале'
                    : `${[
                        formatDeltaHint(revenueDelta ?? 0, 'прибыль'),
                        formatDeltaHint(costDelta ?? 0, 'затраты'),
                      ]
                        .filter(Boolean)
                        .join(' · ')} к прошлому прогнозу`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
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
  variant?: 'gantt' | 'peek';
}

/** Текущий прогноз окупаемости за выбранный период. */
export function InitiativePaybackCurrentSummary({
  quarterlyData,
  selectedQuarters,
  variant = 'peek',
}: InitiativePaybackCurrentSummaryProps) {
  const summary = useMemo(
    () => computeInitiativePayback(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  if (!summary) return null;

  const ratioLabel =
    summary.ratio != null ? formatPaybackRatio(summary.ratio) : `+${formatBudget(summary.periodRevenue)}`;

  return (
    <section>
      <h3 className={sectionLabelClass(variant)}>Текущий прогноз окупаемости</h3>
      <div
        className="initiative-payback-current-card"
        title={paybackSummaryTitle(summary)}
      >
        <p className="initiative-payback-current-totals">
          Стоимость <strong>{formatBudget(summary.periodCost)}</strong>
          <span className="initiative-payback-current-totals-sep">·</span>
          Прибыль <strong>{formatBudget(summary.periodRevenue)}</strong>
        </p>
        <span
          className={cn(
            'initiative-payback-current-ratio font-semibold tabular-nums',
            summary.ratio != null && paybackToneClass(summary.isPaidOff)
          )}
        >
          {ratioLabel}
        </span>
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
    () => computeInitiativePayback(quarterlyData, selectedQuarters),
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
          variant={variant}
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
        const ratioLabel = summary.ratio != null ? formatPaybackRatio(summary.ratio) : '—';
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
                  Стоимость <strong>{formatBudget(summary.periodCost)}</strong>
                  <span className="gantt-detail-payback-history-totals-sep">·</span>
                  Прибыль <strong>{formatBudget(summary.periodRevenue)}</strong>
                </span>
              </span>
              <span
                className={cn(
                  'gantt-detail-payback-history-ratio font-semibold tabular-nums',
                  summary.ratio != null && paybackToneClass(summary.isPaidOff)
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
        Пока нет записей. Заполните прибыль по кварталам в админке и сохраните — история начнёт
        копиться с первого изменения.
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
