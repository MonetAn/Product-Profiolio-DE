import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Split } from 'lucide-react';
import type { UnitRegionDetailRow } from '@/lib/locationRegionModel';
import {
  formatLocationCompactM,
  formatLocationDeltaM,
  formatLocationFullAmount,
} from '@/lib/locationDisplayFormat';
import { LocationEntityProportionLine } from '@/components/admin/location-allocation/LocationEntityStackBar';
import { cn } from '@/lib/utils';

const DELTA_ABOVE = '#5B8FD4';
const DELTA_BELOW = '#E1942F';

export const REGION_ENTITY_LIST_VIEWPORT_PX = 380;

/** # | Entity | аллокация */
const GRID_COLUMNS_OVERVIEW = '1.125rem minmax(3rem,1fr) minmax(6.75rem,1.25fr)';

/** # | Entity | аллокация | Δ | full cost share */
const GRID_COLUMNS_REGION =
  '1.125rem minmax(2.75rem,0.85fr) minmax(6.75rem,1.15fr) minmax(3.25rem,4.25rem) minmax(5rem,0.9fr)';

const DELTA_COLUMN_TITLE = 'Дельта распределения по выручке';
const ENTITY_SHARE_COLUMN_LABEL = 'Доля от всей стоимости юнита';

type Props = {
  titleLabel: string;
  contextLabel?: string | null;
  entityColumnLabel: string;
  countSuffix: string;
  emptyMessage: string;
  rows: UnitRegionDetailRow[];
  selectedName?: string | null;
  onSelect?: (name: string) => void;
  isRowSelected?: (row: UnitRegionDetailRow) => boolean;
  onSelectRow?: (row: UnitRegionDetailRow) => void;
  scrollable?: boolean;
  listViewportPx?: number;
  className?: string;
  overviewMode?: boolean;
};

function AllocationAmountCell({ row }: { row: UnitRegionDetailRow }) {
  if (row.factRub <= 0 && row.planRub <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="block text-right leading-snug">
      {row.factRub > 0 ? (
        <span className="font-semibold text-foreground tabular-nums">
          {formatLocationCompactM(row.factRub)}
        </span>
      ) : null}
      {row.planRub > 0 ? (
        <span
          className={cn(
            'block tabular-nums text-muted-foreground',
            row.factRub > 0 && 'mt-0.5'
          )}
        >
          vs {formatLocationCompactM(row.planRub)}
        </span>
      ) : null}
    </span>
  );
}

export function LocationRegionEntityRankedList({
  titleLabel,
  contextLabel = null,
  entityColumnLabel,
  countSuffix,
  emptyMessage,
  rows,
  selectedName = null,
  onSelect,
  isRowSelected,
  onSelectRow,
  scrollable = false,
  listViewportPx = REGION_ENTITY_LIST_VIEWPORT_PX,
  className,
  overviewMode = false,
}: Props) {
  const [hoverName, setHoverName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const ranked = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.factRub - a.factRub || b.planRub - a.planRub || a.name.localeCompare(b.name, 'ru')
      ),
    [rows]
  );

  const regionFactTotal = ranked.reduce((s, r) => s + r.factRub, 0);
  const maxEntityFactRub = useMemo(
    () => ranked.reduce((m, r) => Math.max(m, r.factRub), 0),
    [ranked]
  );

  const title = contextLabel ? `${titleLabel} · ${contextLabel}` : titleLabel;

  const shareLabel = overviewMode ? 'от общего' : 'бюджета региона';
  const gridColumns = overviewMode ? GRID_COLUMNS_OVERVIEW : GRID_COLUMNS_REGION;

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!el || !scrollable) {
      setCanScrollDown(false);
      return;
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    if (!hasOverflow) {
      setCanScrollDown(false);
      return;
    }

    if (sentinel) {
      const containerRect = el.getBoundingClientRect();
      const sentinelRect = sentinel.getBoundingClientRect();
      setCanScrollDown(sentinelRect.bottom > containerRect.bottom + 2);
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 2);
  }, [scrollable]);

  useEffect(() => {
    if (!scrollable) {
      setCanScrollDown(false);
      return;
    }

    const el = scrollRef.current;
    const sentinel = sentinelRef.current;
    const content = contentRef.current;
    if (!el || !sentinel) return;

    let rafId = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateScrollHints);
    };

    const onScroll = () => scheduleUpdate();

    scheduleUpdate();

    const io = new IntersectionObserver(
      () => scheduleUpdate(),
      { root: el, threshold: [0, 0.5, 0.99, 1] }
    );
    io.observe(sentinel);

    el.addEventListener('scroll', onScroll, { passive: true });
    const main = el.closest('main');
    main?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(el);
    ro.observe(sentinel);
    if (content) ro.observe(content);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      main?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrollable, listViewportPx, ranked.length, overviewMode, updateScrollHints]);

  if (rows.length === 0) {
    return (
      <div className={cn('flex min-h-0 flex-col', className)}>
        <div className="mb-2">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const listBody = (
    <ul ref={contentRef} className="divide-y divide-border/35">
      {ranked.map((row, index) => {
        const emphasized = hoverName === row.name;
        const selected = isRowSelected
          ? isRowSelected(row)
          : selectedName === row.name;
        const deltaColor = row.deltaRub >= 0 ? DELTA_ABOVE : DELTA_BELOW;
        const entitySharePct = row.entityRegionSharePct;
        const interactive = Boolean(onSelectRow || onSelect);
        const tooltip = overviewMode
          ? `${row.name}\n` +
            `Алокация: ${formatLocationFullAmount(row.factRub)} (${row.regionBudgetSharePct.toFixed(1)}% ${shareLabel})\n` +
            `vs ${formatLocationFullAmount(row.planRub)}`
          : `${row.name}\n` +
            `Алокация: ${formatLocationFullAmount(row.factRub)} (${row.regionBudgetSharePct.toFixed(1)}% ${shareLabel})\n` +
            `vs ${formatLocationFullAmount(row.planRub)}\n` +
            `Дельта распределения по выручке: ${formatLocationFullAmount(row.deltaRub)}\n` +
            `${ENTITY_SHARE_COLUMN_LABEL}: ${entitySharePct.toFixed(1)}% · ${formatLocationFullAmount(row.entityTotalRub)}`;

        const rowContent = (
          <>
            <span className="text-right text-[10px] tabular-nums text-muted-foreground self-center">
              {index + 1}
            </span>
            <LocationEntityProportionLine
              name={row.name}
              factRub={row.factRub}
              maxFactRub={maxEntityFactRub}
              emphasized={emphasized}
              selected={selected}
            />
            <span className="text-[10px] self-center">
              <AllocationAmountCell row={row} />
            </span>
            {!overviewMode ? (
              <>
                <span
                  className="text-right text-[10px] font-semibold tabular-nums self-center"
                  style={{ color: row.deltaRub === 0 ? undefined : deltaColor }}
                >
                  {formatLocationDeltaM(row.deltaRub)}
                </span>
                <span className="text-right text-[10px] tabular-nums leading-tight self-center text-muted-foreground">
                  <span className="font-medium text-foreground/65">{entitySharePct.toFixed(0)}%</span>
                  {' '}от {formatLocationCompactM(row.entityTotalRub)}
                </span>
              </>
            ) : null}
          </>
        );

        const rowClass = cn(
          'grid w-full gap-x-1.5 min-h-[46px] max-h-[54px] py-1 transition-colors rounded-sm -mx-1 px-1 text-left items-center',
          emphasized && 'bg-muted/35',
          selected && 'bg-primary/[0.07] ring-1 ring-primary/30',
          interactive && 'cursor-pointer hover:bg-muted/25'
        );

        const handleActivate = () => {
          if (onSelectRow) onSelectRow(row);
          else onSelect?.(row.name);
        };

        if (interactive) {
          return (
            <li key={(row as { key?: string }).key ?? `${row.name}-${index}`}>
              <button
                type="button"
                className={rowClass}
                style={{ gridTemplateColumns: gridColumns }}
                title={tooltip}
                onClick={handleActivate}
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
            key={(row as { key?: string }).key ?? `${row.name}-${index}`}
            className={rowClass}
            style={{ gridTemplateColumns: gridColumns }}
            title={tooltip}
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
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="mb-2 shrink-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold tracking-tight min-w-0">{title}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground shrink-0">
            {formatLocationCompactM(regionFactTotal)}
            {' · '}
            {ranked.length} {countSuffix}
          </p>
        </div>
      </div>

      <div
        className="mb-1 grid shrink-0 items-end gap-x-1.5 border-b border-border/50 pb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span className="text-right">#</span>
        <span>{entityColumnLabel}</span>
        <span className="text-right leading-tight">Алокации</span>
        {!overviewMode ? (
          <>
            <span
              className="inline-flex flex-wrap items-center justify-end gap-x-0.5 gap-y-0 text-right leading-[1.15]"
              title={DELTA_COLUMN_TITLE}
            >
              <span>Дельта к</span>
              <Split className="h-3 w-3 shrink-0" aria-hidden />
              <span>по выручке</span>
            </span>
            <span className="text-right leading-tight">{ENTITY_SHARE_COLUMN_LABEL}</span>
          </>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className={cn(
            'min-h-0',
            scrollable ? 'overflow-y-auto overscroll-y-contain pr-0.5' : undefined
          )}
          style={
            scrollable
              ? { maxHeight: listViewportPx, minHeight: listViewportPx }
              : undefined
          }
          onMouseEnter={scrollable ? updateScrollHints : undefined}
        >
          {listBody}
          {scrollable ? (
            <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
          ) : null}
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

/** @deprecated use LocationRegionEntityRankedList */
export function LocationUnitRegionRankedList(
  props: Omit<
    Props,
    'titleLabel' | 'entityColumnLabel' | 'countSuffix' | 'emptyMessage'
  > & {
    regionName: string;
    rows: UnitRegionDetailRow[];
  }
) {
  return (
    <LocationRegionEntityRankedList
      titleLabel="Детализация по юнитам"
      entityColumnLabel="Юнит"
      countSuffix="юн."
      emptyMessage="Нет сумм по юнитам."
      {...props}
    />
  );
}
