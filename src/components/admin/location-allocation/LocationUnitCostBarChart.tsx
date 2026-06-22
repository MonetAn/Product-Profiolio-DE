import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UnitCostBarRow } from '@/lib/locationRegionModel';
import { cn } from '@/lib/utils';

export const RANKED_COST_LIST_VIEWPORT_PX = 380;

const BAR_PALETTE = [
  'hsl(var(--primary) / 0.88)',
  'hsl(var(--primary) / 0.72)',
  'hsl(var(--primary) / 0.58)',
  'hsl(var(--primary) / 0.48)',
  'hsl(var(--primary) / 0.4)',
];

const GRID_COLUMNS = '1.25rem minmax(0,1fr) 4.25rem 2.5rem minmax(3.5rem,22%)';

type Props = {
  title: string;
  subtitle?: string;
  rows: UnitCostBarRow[];
  entityLabel?: string;
  emptyMessage?: string;
  countSuffix?: string;
  selectedName?: string | null;
  onSelect?: (name: string) => void;
  scrollable?: boolean;
  listViewportPx?: number;
  className?: string;
};

function formatValueM(rub: number): string {
  const m = rub / 1_000_000;
  if (m >= 100) return `${m.toFixed(0)}M ₽`;
  if (m >= 10) return `${m.toFixed(1)}M ₽`;
  return `${m.toFixed(1)}M ₽`;
}

function formatFullRub(rub: number): string {
  return `${Math.round(rub).toLocaleString('ru-RU')} ₽`;
}

export function LocationUnitCostBarChart({
  title,
  subtitle,
  rows,
  entityLabel = 'Юнит',
  emptyMessage = 'Нет данных.',
  countSuffix = 'шт.',
  selectedName = null,
  onSelect,
  scrollable = false,
  listViewportPx = RANKED_COST_LIST_VIEWPORT_PX,
  className,
}: Props) {
  const [hoverName, setHoverName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const totalRub = rows.reduce((s, r) => s + r.value, 0);

  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ru')),
    [rows]
  );

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !scrollable) {
      setCanScrollDown(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 6);
  }, [scrollable]);

  useEffect(() => {
    updateScrollHints();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollHints, { passive: true });
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollHints);
      ro.disconnect();
    };
  }, [ranked, scrollable, listViewportPx, updateScrollHints]);

  if (rows.length === 0) {
    return (
      <div className={cn('flex min-h-0 flex-col', className)}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{title}</p>
            {subtitle ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const listBody = (
    <ul className="divide-y divide-border/35">
      {ranked.map((row, index) => {
        const pct = totalRub > 0 ? (row.value / totalRub) * 100 : 0;
        const emphasized = hoverName === row.name;
        const selected = selectedName === row.name;
        const barColor = BAR_PALETTE[Math.min(index, BAR_PALETTE.length - 1)];
        const interactive = Boolean(onSelect);

        const rowContent = (
          <>
            <span className="text-right text-[11px] tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span
              className={cn(
                'min-w-0 truncate text-xs font-medium',
                emphasized || selected ? 'text-foreground' : 'text-foreground/90'
              )}
            >
              {row.name}
            </span>
            <span className="text-right text-xs font-semibold tabular-nums tracking-tight">
              {formatValueM(row.value)}
            </span>
            <span className="text-right text-[11px] tabular-nums text-muted-foreground">
              {pct.toFixed(1)}
            </span>
            <div className="relative h-2 min-w-0 rounded-full bg-muted/50 ring-1 ring-border/25">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
                style={{
                  width: `${Math.max(pct, row.value > 0 ? 2 : 0)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </>
        );

        const rowClass = cn(
          'grid w-full items-center gap-x-2 py-1 transition-colors rounded-sm -mx-1 px-1 text-left',
          emphasized && 'bg-muted/40',
          selected && 'bg-primary/[0.06] ring-1 ring-primary/35',
          interactive && 'cursor-pointer hover:bg-muted/30'
        );

        if (interactive) {
          return (
            <li key={row.name}>
              <button
                type="button"
                className={rowClass}
                style={{ gridTemplateColumns: GRID_COLUMNS }}
                title={`${row.name}: ${formatFullRub(row.value)} (${pct.toFixed(1)}%)`}
                onClick={() => onSelect?.(row.name)}
                onMouseEnter={() => setHoverName(row.name)}
                onMouseLeave={() => setHoverName(null)}
              >
                {rowContent}
              </button>
            </li>
          );
        }

        return (
          <li
            key={row.name}
            className={rowClass}
            style={{ gridTemplateColumns: GRID_COLUMNS }}
            title={`${row.name}: ${formatFullRub(row.value)} (${pct.toFixed(1)}%)`}
            onMouseEnter={() => setHoverName(row.name)}
            onMouseLeave={() => setHoverName(null)}
          >
            {rowContent}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={cn('flex min-h-0 flex-col h-full', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        <p className="text-[11px] tabular-nums text-muted-foreground shrink-0">
          {formatFullRub(totalRub)} · {ranked.length} {countSuffix}
          {scrollable && canScrollDown ? ' · ↓' : ''}
        </p>
      </div>

      <div
        className="mb-1 grid shrink-0 items-center gap-x-2 border-b border-border/50 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        <span className="text-right">#</span>
        <span>{entityLabel}</span>
        <span className="text-right">Факт</span>
        <span className="text-right">%</span>
        <span className="sr-only">Доля</span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className={cn(
            'min-h-0',
            scrollable ? 'overflow-y-auto overscroll-y-contain pr-0.5' : 'overflow-hidden'
          )}
          style={{ maxHeight: listViewportPx, minHeight: listViewportPx }}
        >
          {listBody}
        </div>

        {scrollable && canScrollDown ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 flex-col items-center justify-end bg-gradient-to-t from-card from-40% via-card/70 to-transparent pb-1"
            aria-hidden
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
            <span className="text-[10px] text-muted-foreground mt-0.5">ещё</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
