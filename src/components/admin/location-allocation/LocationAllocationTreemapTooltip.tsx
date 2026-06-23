import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type { LocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import {
  collectLocationTreemapInitiativeIds,
  resolveLocationTreemapNodeYearCost,
  sumLocationTreemapClusterMarketBreakdown,
} from '@/lib/locationAllocationTreemap';
import { formatLocationCompactM, formatLocationFullAmount } from '@/lib/locationDisplayFormat';

const CURSOR_OFFSET = 12;
const SCREEN_PADDING = 16;
const WIDE_TOOLTIP_MARKET_THRESHOLD = 10;

type Props = {
  data: { node: TreemapLayoutNode; position: { x: number; y: number } } | null;
  meta: LocationAllocationTreemapMeta;
  showMoney?: boolean;
};

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export const LocationAllocationTreemapTooltip = memo(function LocationAllocationTreemapTooltip({
  data,
  meta,
  showMoney = true,
}: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!tooltipRef.current || !data) {
      setPosition(null);
      return;
    }

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();

    let x = data.position.x + CURSOR_OFFSET;
    let y = data.position.y + CURSOR_OFFSET;

    if (x + rect.width > window.innerWidth - SCREEN_PADDING) {
      x = data.position.x - rect.width - CURSOR_OFFSET;
    }
    if (x < SCREEN_PADDING) x = SCREEN_PADDING;

    if (y + rect.height > window.innerHeight - SCREEN_PADDING) {
      y = data.position.y - rect.height - CURSOR_OFFSET;
    }
    if (y < SCREEN_PADDING) y = SCREEN_PADDING;

    setPosition({ x, y });
  }, [data]);

  const clusterGroups = useMemo(() => {
    if (!data) return [];
    const initiativeIds = collectLocationTreemapInitiativeIds(data.node, meta);
    return sumLocationTreemapClusterMarketBreakdown(initiativeIds, meta);
  }, [data, meta]);

  const body = useMemo(() => {
    if (!data) return null;

    const { node } = data;
    const fullCost = resolveLocationTreemapNodeYearCost(node, meta);
    const marketCount = clusterGroups.reduce((s, g) => s + g.markets.length, 0);

    return (
      <>
        {node.data.team && !node.isTeam ? (
          <p className="text-xs text-muted-foreground">{node.data.team}</p>
        ) : null}
        {node.data.unit && !node.isUnit ? (
          <p className="text-xs text-muted-foreground">{node.data.unit}</p>
        ) : null}
        {showMoney ? (
          <div className="flex justify-between gap-4 text-xs">
            <span className="text-muted-foreground">
              {node.isInitiative ? 'Полная стоимость' : 'Сумма'}
            </span>
            <span className="font-medium tabular-nums">
              {formatLocationCompactM(fullCost)}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({formatLocationFullAmount(fullCost)} ₽)
              </span>
            </span>
          </div>
        ) : null}

        {marketCount > 0 ? (
          <div className={cn(showMoney && 'border-t border-border/60 pt-2')}>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              По рынкам
            </p>
            <div className="max-h-[280px] space-y-2.5 overflow-y-auto">
              {clusterGroups.map((group) => (
                <div key={group.clusterLabel}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/75">
                    {group.clusterLabel}
                  </p>
                  <div className="space-y-0.5 pl-2">
                    {group.markets.map(({ label, rub }) => (
                      <div
                        key={label}
                        className="flex items-baseline justify-between gap-2 text-xs tabular-nums min-w-0"
                      >
                        <span className="text-muted-foreground truncate">{label}</span>
                        <span className="text-right shrink-0">
                          <span className="text-muted-foreground">{pct(rub, fullCost)}</span>
                          {showMoney ? (
                            <>
                              <span className="mx-1 text-muted-foreground/60">·</span>
                              <span>{formatLocationCompactM(rub)}</span>
                            </>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Нет аллокации по рынкам</p>
        )}
      </>
    );
  }, [clusterGroups, data, showMoney, meta]);

  const marketCount = clusterGroups.reduce((s, g) => s + g.markets.length, 0);
  const wideTooltip = marketCount > WIDE_TOOLTIP_MARKET_THRESHOLD;

  if (!data) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={cn(
        'treemap-tooltip location-allocation-treemap-tooltip pointer-events-none fixed z-[9999] rounded-lg border border-border bg-popover p-3 shadow-lg',
        wideTooltip ? 'max-w-[400px]' : 'max-w-[320px]',
        data && position && 'visible'
      )}
      style={{
        left: position?.x ?? data.position.x + CURSOR_OFFSET,
        top: position?.y ?? data.position.y + CURSOR_OFFSET,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <p className="mb-2 text-sm font-semibold leading-tight">{data.node.name}</p>
      <div className="space-y-2">{body}</div>
    </div>,
    document.body
  );
});
