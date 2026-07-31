import { useMemo } from 'react';
import { formatBudget } from '@/lib/dataManager';
import {
  computeInitiativePayback,
  formatPaybackRatio,
  formatRoiPercent,
  paybackSummaryTitle,
  paybackToneClass,
  type InitiativePaybackQuarter,
} from '@/lib/initiativePayback';
import { cn } from '@/lib/utils';

export type InitiativePaybackLabelVariant = 'inline' | 'tile';

interface InitiativePaybackLabelProps {
  quarterlyData?: Record<string, InitiativePaybackQuarter>;
  selectedQuarters: string[];
  className?: string;
  size?: 'xs' | 'sm';
  /** inline — светлый фон (таймлайн); tile — полупрозрачный бейдж на плитке тримэпа */
  variant?: InitiativePaybackLabelVariant;
}

function PaybackTileBadge({
  tone,
  label,
  size,
  className,
}: {
  tone: 'profit-ok' | 'profit-warning' | 'revenue';
  label: string;
  size: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'treemap-payback-badge inline-flex max-w-full items-center gap-1 rounded-sm',
        'bg-black/30 px-1.5 py-0.5 text-white/95',
        'font-semibold tabular-nums leading-none',
        size === 'xs' ? 'text-[9px]' : 'text-[10px]',
        className
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'profit-ok' && 'bg-emerald-300/85',
          tone === 'profit-warning' && 'bg-amber-300/85',
          tone === 'revenue' && 'bg-sky-300/90'
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** ROI по прибыли; если прибыли нет — отношение выручки к затратам. */
export function InitiativePaybackLabel({
  quarterlyData,
  selectedQuarters,
  className,
  size = 'sm',
  variant = 'inline',
}: InitiativePaybackLabelProps) {
  const summary = useMemo(
    () => computeInitiativePayback(quarterlyData, selectedQuarters),
    [quarterlyData, selectedQuarters]
  );

  if (!summary) return null;

  const title = paybackSummaryTitle(summary);
  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-[12px]';

  if (summary.periodRevenue > 0) {
    const label =
      summary.ratio == null
        ? `Прибыль +${formatBudget(summary.periodRevenue)}`
        : `ROI ${formatRoiPercent(summary.ratio)}`;
    if (variant === 'tile') {
      return (
        <PaybackTileBadge
          tone={summary.isPaidOff ? 'profit-ok' : 'profit-warning'}
          label={label}
          size={size}
          className={className}
        />
      );
    }
    return (
      <span
        className={cn(
          'font-semibold',
          summary.ratio == null
            ? 'text-emerald-600'
            : paybackToneClass(summary.isPaidOff),
          sizeClass,
          className
        )}
        title={title}
      >
        {label}
      </span>
    );
  }

  if (summary.periodGrossRevenue <= 0) return null;

  const label =
    summary.grossRevenueToCostRatio == null
      ? `Выручка +${formatBudget(summary.periodGrossRevenue)}`
      : `Выручка ${formatPaybackRatio(summary.grossRevenueToCostRatio)}`;

  if (variant === 'tile') {
    return (
      <PaybackTileBadge
        tone="revenue"
        label={label}
        size={size}
        className={className}
      />
    );
  }

  return (
    <span
      className={cn('font-semibold text-sky-700 dark:text-sky-400', sizeClass, className)}
      title={title}
    >
      {label}
    </span>
  );
}
