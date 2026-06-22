import { useCallback, useMemo, useRef, useState } from 'react';
import type { UnitRegionDetailRow } from '@/lib/locationRegionModel';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { cn } from '@/lib/utils';

const BAR_PALETTE = [
  'hsl(var(--primary) / 0.88)',
  'hsl(var(--primary) / 0.72)',
  'hsl(var(--primary) / 0.58)',
  'hsl(var(--primary) / 0.48)',
  'hsl(var(--primary) / 0.4)',
  'hsl(var(--primary) / 0.34)',
  'hsl(var(--primary) / 0.28)',
  'hsl(var(--primary) / 0.22)',
];

type Props = {
  rows: UnitRegionDetailRow[];
  selectedName?: string | null;
  isRowSelected?: (row: UnitRegionDetailRow) => boolean;
  onSelect?: (name: string) => void;
  onSelectRow?: (row: UnitRegionDetailRow) => void;
  className?: string;
  variant?: 'default' | 'compact';
};

function rowKey(row: UnitRegionDetailRow, index: number): string {
  return (row as { key?: string }).key ?? `${row.name}-${index}`;
}

type ProportionLineProps = {
  name: string;
  factRub: number;
  maxFactRub: number;
  emphasized?: boolean;
  selected?: boolean;
};

export function LocationEntityProportionLine({
  name,
  factRub,
  maxFactRub,
  emphasized,
  selected,
}: ProportionLineProps) {
  const widthPct =
    maxFactRub > 0 && factRub > 0
      ? Math.max((factRub / maxFactRub) * 100, 3)
      : 0;

  return (
    <span className="min-w-0 self-center">
      <span
        className={cn(
          'block truncate text-[11px] font-medium leading-tight',
          emphasized || selected ? 'text-foreground' : 'text-foreground/90'
        )}
      >
        {name}
      </span>
      <span
        className="mt-1 block h-1 w-full rounded-full bg-muted/55"
        aria-hidden
      >
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-200',
            selected ? 'bg-primary' : 'bg-primary/75'
          )}
          style={{ width: `${widthPct}%` }}
        />
      </span>
    </span>
  );
}

export function LocationEntityStackBar({
  rows,
  selectedName = null,
  isRowSelected,
  onSelect,
  onSelectRow,
  className,
  variant = 'default',
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; pct: number } | null>(
    null
  );

  const segments = useMemo(
    () =>
      [...rows]
        .filter((r) => r.factRub > 0)
        .sort((a, b) => b.factRub - a.factRub || a.name.localeCompare(b.name, 'ru')),
    [rows]
  );

  const total = segments.reduce((s, r) => s + r.factRub, 0);

  const isSelected = useCallback(
    (row: UnitRegionDetailRow) =>
      isRowSelected ? isRowSelected(row) : selectedName === row.name,
    [isRowSelected, selectedName]
  );

  const activate = useCallback(
    (row: UnitRegionDetailRow) => {
      if (onSelectRow) onSelectRow(row);
      else onSelect?.(row.name);
    },
    [onSelect, onSelectRow]
  );

  const showTooltip = useCallback((el: HTMLElement, row: UnitRegionDetailRow, pct: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const barRect = bar.getBoundingClientRect();
    const segRect = el.getBoundingClientRect();
    setTooltip({
      x: segRect.left + segRect.width / 2 - barRect.left,
      y: -6,
      label: `${row.name} · ${formatLocationCompactM(row.factRub)} (${pct.toFixed(1)}%)`,
      pct,
    });
  }, []);

  if (segments.length === 0 || total <= 0) {
    return null;
  }

  const interactive = Boolean(onSelect || onSelectRow);

  const compact = variant === 'compact';

  return (
    <div className={cn('relative', compact ? 'mb-0' : 'mb-3', className)}>
      <div
        ref={barRef}
        className={cn(
          'flex w-full overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/40',
          compact ? 'h-2.5' : 'h-9 rounded-lg'
        )}
        onMouseLeave={() => {
          setHoverKey(null);
          setTooltip(null);
        }}
      >
        {segments.map((row, index) => {
          const key = rowKey(row, index);
          const pct = (row.factRub / total) * 100;
          const widthPct = Math.max(pct, row.factRub > 0 ? 0.8 : 0);
          const selected = isSelected(row);
          const hovered = hoverKey === key;
          const color = BAR_PALETTE[Math.min(index, BAR_PALETTE.length - 1)];

          const segmentClass = cn(
            'h-full min-w-0 border-r border-background/40 last:border-r-0 transition-opacity',
            interactive && 'cursor-pointer hover:opacity-95',
            selected && (compact ? 'brightness-125 saturate-150 z-[1]' : 'ring-2 ring-primary ring-inset z-[1]'),
            hovered && !selected && 'opacity-90'
          );

          const style = {
            width: `${widthPct}%`,
            backgroundColor: color,
          };

          if (interactive) {
            return (
              <button
                key={key}
                type="button"
                className={segmentClass}
                style={style}
                aria-label={row.name}
                onClick={() => activate(row)}
                onMouseEnter={(e) => {
                  setHoverKey(key);
                  showTooltip(e.currentTarget, row, pct);
                }}
                onMouseMove={(e) => showTooltip(e.currentTarget, row, pct)}
              />
            );
          }

          return (
            <div
              key={key}
              className={segmentClass}
              style={style}
              onMouseEnter={(e) => {
                setHoverKey(key);
                showTooltip(e.currentTarget, row, pct);
              }}
              onMouseMove={(e) => showTooltip(e.currentTarget, row, pct)}
            />
          );
        })}
      </div>

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] tabular-nums text-popover-foreground shadow-md"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.label}
        </div>
      ) : null}
    </div>
  );
}
