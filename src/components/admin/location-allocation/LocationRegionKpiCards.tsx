import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import {
  TOP_REGION_DISPLAY_LABELS,
  type RegionComparisonRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { cn } from '@/lib/utils';

const ABOVE_PLAN = '#5B8FD4';
const BELOW_PLAN = '#E1942F';

function deltaPct(planRub: number, actualRub: number): number | null {
  if (planRub <= 0) return null;
  return ((actualRub - planRub) / planRub) * 100;
}

type RegionKpiBlockProps = {
  label: TopRegionLabel;
  actualRub: number;
  planRub: number;
  onClick?: () => void;
  selected?: boolean;
};

function RegionKpiBlock({
  label,
  actualRub,
  planRub,
  onClick,
  selected,
}: RegionKpiBlockProps) {
  const deltaRub = actualRub - planRub;
  const pct = deltaPct(planRub, actualRub);
  const above = deltaRub >= -1;
  const trendColor = above ? ABOVE_PLAN : BELOW_PLAN;
  const TrendIcon = above ? ArrowUp : ArrowDown;
  const deltaAbs = Math.abs(deltaRub);
  const regionTitle = `Аллокации на ${TOP_REGION_DISPLAY_LABELS[label]}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col rounded-lg border p-3 text-left shadow-sm transition-all',
        'border-border bg-card',
        onClick && 'hover:border-primary/45 hover:bg-primary/[0.06] hover:shadow-md cursor-pointer',
        selected && 'ring-2 ring-primary border-primary/50 bg-primary/[0.1] shadow-md',
        !onClick && 'cursor-default'
      )}
    >
      <p className="text-[11px] font-semibold text-foreground/80 leading-snug line-clamp-2">
        {regionTitle}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {actualRub > 0 ? formatLocationCompactM(actualRub) : '—'}
      </p>
      <p className="mt-1.5 text-xs leading-snug">
        {planRub > 0 && actualRub > 0 && deltaAbs >= 1 && pct != null ? (
          <span className="inline-flex flex-wrap items-center gap-x-1">
            <span className="text-muted-foreground font-normal whitespace-nowrap">vs</span>
            <span className="text-muted-foreground font-normal tabular-nums whitespace-nowrap">
              {formatLocationCompactM(planRub)}
            </span>
            <span
              className="inline-flex items-center gap-0.5 font-semibold tabular-nums whitespace-nowrap"
              style={{ color: trendColor }}
            >
              <TrendIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                {formatLocationCompactM(deltaAbs)} ({Math.abs(pct).toFixed(1)}%)
              </span>
            </span>
          </span>
        ) : planRub > 0 ? (
          <span className="text-muted-foreground tabular-nums">
            vs {formatLocationCompactM(planRub)}
          </span>
        ) : (
          <span className="text-muted-foreground">нет плана</span>
        )}
      </p>
    </button>
  );
}

type Props = {
  year: number;
  totalRub: number;
  rows: RegionComparisonRow[];
  selectedRegion?: TopRegionLabel | null;
  onSelectRegion?: (region: TopRegionLabel | null) => void;
};

export function LocationRegionKpiCards({
  year,
  totalRub,
  rows,
  selectedRegion = null,
  onSelectRegion,
}: Props) {
  if (totalRub <= 0 && rows.every((r) => r.planRub <= 0 && r.actualRub <= 0)) {
    return (
      <p className="text-sm text-muted-foreground">Нет данных по регионам.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card shadow-sm transition-colors">
        <button
          type="button"
          onClick={onSelectRegion ? () => onSelectRegion(null) : undefined}
          className={cn(
            'w-full px-4 pt-4 pb-3 text-left sm:px-5 sm:pt-5',
            onSelectRegion && 'hover:bg-muted/20 cursor-pointer rounded-t-xl',
            !onSelectRegion && 'cursor-default'
          )}
        >
          <p className="text-sm font-medium text-muted-foreground">
            Бюджет Dodo Engineering {year}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {totalRub > 0 ? formatLocationCompactM(totalRub) : '—'}
          </p>
        </button>

        <div className="border-t border-border/70 bg-muted/25 px-4 py-3 sm:px-5 sm:py-4">
          <p className="mb-3 text-sm leading-snug">
            <span className="font-semibold text-foreground">Новые аллокации</span>
            <span className="text-muted-foreground"> vs распределение пропорционально выручке</span>
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {rows.map((row) => (
              <RegionKpiBlock
                key={row.region}
                label={row.region}
                actualRub={row.actualRub}
                planRub={row.planRub}
                selected={selectedRegion === row.region}
                onClick={
                  onSelectRegion
                    ? () =>
                        onSelectRegion(selectedRegion === row.region ? null : row.region)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
