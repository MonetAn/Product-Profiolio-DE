import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type {
  LocationAllocationTreemapMeta,
  LocationAllocationTreemapScope,
} from '@/lib/locationAllocationTreemap';
import {
  collectLocationTreemapInitiativeIds,
  resolveLocationTreemapNodeYearCost,
  resolveLocationTreemapNodeScopedCost,
  sumLocationTreemapClusterMarketBreakdown,
  sumLocationTreemapRegionBreakdown,
  treemapScopeLabel,
} from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  TOP_REGION_ORDER,
  TOP_REGION_SHORT_LABELS,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { formatLocationCompactM, formatLocationFullAmount } from '@/lib/locationDisplayFormat';

const CURSOR_OFFSET = 12;
const SCREEN_PADDING = 16;
const WIDE_TOOLTIP_MARKET_THRESHOLD = 10;

type Props = {
  data: { node: TreemapLayoutNode; position: { x: number; y: number } } | null;
  meta: LocationAllocationTreemapMeta;
  treemapScope?: LocationAllocationTreemapScope;
  countries?: MarketCountryRow[];
  countryIdToClusterKey?: Map<string, string>;
  showMoney?: boolean;
};

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export const LocationAllocationTreemapTooltip = memo(function LocationAllocationTreemapTooltip({
  data,
  meta,
  treemapScope = { kind: 'all' },
  countries = [],
  countryIdToClusterKey = new Map(),
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

  const initiativeIds = useMemo(() => {
    if (!data) return [];
    return collectLocationTreemapInitiativeIds(data.node, meta);
  }, [data, meta]);

  const clusterGroups = useMemo(() => {
    if (!data) return [];
    const filter =
      treemapScope.kind === 'all'
        ? undefined
        : { scope: treemapScope, countries, countryIdToClusterKey };
    return sumLocationTreemapClusterMarketBreakdown(initiativeIds, meta, filter);
  }, [data, initiativeIds, meta, treemapScope, countries, countryIdToClusterKey]);

  const body = useMemo(() => {
    if (!data) return null;

    const { node } = data;
    const fullCost = resolveLocationTreemapNodeYearCost(node, meta);
    const scopedCost = resolveLocationTreemapNodeScopedCost(
      node,
      meta,
      treemapScope,
      countries,
      countryIdToClusterKey
    );
    const isFiltered = treemapScope.kind !== 'all';
    const scopeLabel = treemapScopeLabel(treemapScope);
    const marketCount = clusterGroups.reduce((s, g) => s + g.markets.length, 0);

    const regionBreakdown = sumLocationTreemapRegionBreakdown(initiativeIds, meta);
    const otherRegions = TOP_REGION_ORDER.map((region) => {
      if (treemapScope.kind === 'region' && region === treemapScope.region) return null;
      const rub = regionBreakdown.get(region) ?? 0;
      if (rub <= 0) return null;
      return { region, rub };
    }).filter((r): r is { region: TopRegionLabel; rub: number } => r != null);

    return (
      <>
        {node.data.team && !node.isTeam ? (
          <p className="text-xs text-muted-foreground">{node.data.team}</p>
        ) : null}
        {node.data.unit && !node.isUnit ? (
          <p className="text-xs text-muted-foreground">{node.data.unit}</p>
        ) : null}
        {showMoney ? (
          <>
            {isFiltered ? (
              <div className="flex justify-between gap-4 text-xs">
                <span className="text-muted-foreground">
                  {scopeLabel ? `Стоимость · ${scopeLabel}` : 'Стоимость в фильтре'}
                </span>
                <span className="font-medium tabular-nums">
                  {formatLocationCompactM(scopedCost)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({formatLocationFullAmount(scopedCost)} ₽)
                  </span>
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-muted-foreground">
                {node.isInitiative ? 'Полная стоимость' : 'Сумма'}
              </span>
              <span className={cn('font-medium tabular-nums', isFiltered && 'text-muted-foreground')}>
                {formatLocationCompactM(fullCost)}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  ({formatLocationFullAmount(fullCost)} ₽)
                </span>
              </span>
            </div>
          </>
        ) : null}

        {isFiltered && otherRegions.length > 0 ? (
          <div className={cn(showMoney && 'border-t border-border/60 pt-2')}>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Другие регионы
            </p>
            <div className="space-y-1">
              {otherRegions.map(({ region, rub }) => (
                <div
                  key={region}
                  className="flex items-baseline justify-between gap-2 text-xs tabular-nums"
                >
                  <span className="text-muted-foreground">{TOP_REGION_SHORT_LABELS[region]}</span>
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
        ) : null}

        {marketCount > 0 ? (
          <div className={cn((showMoney || otherRegions.length > 0) && 'border-t border-border/60 pt-2')}>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {isFiltered ? 'Рынки в фильтре' : 'По рынкам'}
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
                          <span className="text-muted-foreground">
                            {pct(rub, isFiltered ? scopedCost : fullCost)}
                          </span>
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
        ) : isFiltered ? (
          <p className="text-xs text-muted-foreground">Нет аллокации по рынкам в фильтре</p>
        ) : (
          <p className="text-xs text-muted-foreground">Нет аллокации по рынкам</p>
        )}
      </>
    );
  }, [
    clusterGroups,
    countries,
    countryIdToClusterKey,
    data,
    initiativeIds,
    meta,
    showMoney,
    treemapScope,
  ]);

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
