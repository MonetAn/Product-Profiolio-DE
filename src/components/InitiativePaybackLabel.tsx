import { useMemo } from 'react';
import { formatBudget } from '@/lib/dataManager';
import {
  computeInitiativePayback,
  formatPaybackRatio,
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
  isPaidOff,
  label,
  size,
  className,
}: {
  isPaidOff: boolean;
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
          isPaidOff ? 'bg-emerald-300/85' : 'bg-amber-300/85'
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Коэффициент окупаемости (×N) или сумма заработка, если затрат нет. */
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

  if (summary.ratio == null) {
    const label = `+${formatBudget(summary.periodRevenue)}`;
    if (variant === 'tile') {
      return (
        <PaybackTileBadge isPaidOff label={label} size={size} className={className} />
      );
    }
    return (
      <span className={cn('font-medium text-emerald-600', sizeClass, className)} title={title}>
        {label}
      </span>
    );
  }

  const label = formatPaybackRatio(summary.ratio);

  if (variant === 'tile') {
    return (
      <PaybackTileBadge
        isPaidOff={summary.isPaidOff}
        label={label}
        size={size}
        className={className}
      />
    );
  }

  return (
    <span
      className={cn('font-semibold', paybackToneClass(summary.isPaidOff), sizeClass, className)}
      title={title}
    >
      {label}
    </span>
  );
}
