import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type {
  LocationAllocationTreemapMeta,
  LocationAllocationTreemapScope,
} from '@/lib/locationAllocationTreemap';
import {
  collectLocationTreemapInitiativeIds,
  resolveLocationTreemapDecisionAnnotation,
  resolveLocationTreemapNodeScopedCost,
  resolveLocationTreemapNodeYearCost,
  sumLocationTreemapAllocationSourceBreakdown,
  sumLocationTreemapClusterMarketBreakdown,
  treemapScopeLabel,
} from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';

const CURSOR_OFFSET = 12;
const SCREEN_PADDING = 16;

type Props = {
  data: { node: TreemapLayoutNode; position: { x: number; y: number } } | null;
  meta: LocationAllocationTreemapMeta;
  treemapScope?: LocationAllocationTreemapScope;
  countries?: MarketCountryRow[];
  countryIdToClusterKey?: Map<string, string>;
  showMoney?: boolean;
};

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

function percentLabel(part: number, whole: number): string {
  const value = percent(part, whole);
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
}

function allocationSourceLabel(revenueRub: number, manualRub: number): string | null {
  const total = revenueRub + manualRub;
  if (total <= 0) return null;
  if (manualRub <= 0) return 'По выручке';
  if (revenueRub <= 0) return 'Вручную';
  return `Выручка ${percentLabel(revenueRub, total)} · вручную ${percentLabel(
    manualRub,
    total
  )}`;
}

function marketCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} рынков`;
  if (mod10 === 1) return `${count} рынок`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} рынка`;
  return `${count} рынков`;
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

    const rect = tooltipRef.current.getBoundingClientRect();
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

  const markets = useMemo(() => {
    const amounts = new Map<string, number>();
    for (const group of clusterGroups) {
      for (const market of group.markets) {
        amounts.set(market.label, (amounts.get(market.label) ?? 0) + market.rub);
      }
    }
    return [...amounts.entries()]
      .map(([label, rub]) => ({ label, rub }))
      .sort((a, b) => b.rub - a.rub || a.label.localeCompare(b.label, 'ru'));
  }, [clusterGroups]);

  const allocationSource = useMemo(() => {
    if (!data) return { revenueRub: 0, manualRub: 0 };
    return sumLocationTreemapAllocationSourceBreakdown(
      initiativeIds,
      meta,
      treemapScope,
      countries,
      countryIdToClusterKey
    );
  }, [data, initiativeIds, meta, treemapScope, countries, countryIdToClusterKey]);

  const annotation = useMemo(() => {
    if (!data) return { comment: null, inheritedFrom: null };
    return resolveLocationTreemapDecisionAnnotation(data.node, initiativeIds, meta);
  }, [data, initiativeIds, meta]);

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
  const primaryCost = isFiltered ? scopedCost : fullCost;
  const sourceLabel = allocationSourceLabel(
    allocationSource.revenueRub,
    allocationSource.manualRub
  );
  const marketTotal = markets.reduce((sum, market) => sum + market.rub, 0);
  const visibleMarkets = markets.slice(0, 5);
  const remainingMarkets = markets.slice(5);
  const remainingMarketsRub = remainingMarkets.reduce(
    (sum, market) => sum + market.rub,
    0
  );

  const breadcrumb = [
    node.data.unit && !node.isUnit ? node.data.unit : null,
    node.data.team && !node.isTeam ? node.data.team : null,
  ].filter((part): part is string => Boolean(part));

  return createPortal(
    <div
      ref={tooltipRef}
      className="location-allocation-treemap-tooltip pointer-events-none fixed z-[9999] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      style={{
        width: 'min(360px, calc(100vw - 32px))',
        left: position?.x ?? data.position.x + CURSOR_OFFSET,
        top: position?.y ?? data.position.y + CURSOR_OFFSET,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="px-3.5 pb-3 pt-3">
        <div className="min-w-0">
          {breadcrumb.length > 0 ? (
            <p className="mb-0.5 truncate text-[10px] text-muted-foreground">
              {breadcrumb.join(' › ')}
            </p>
          ) : null}
          <p className="break-words text-sm font-semibold leading-snug">
            {node.name}
          </p>
        </div>

        {showMoney || sourceLabel || isFiltered ? (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-t border-border/50 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {showMoney ? (
                <span className="text-sm font-semibold tabular-nums">
                  {formatLocationCompactM(primaryCost)}
                </span>
              ) : null}
              {sourceLabel ? (
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {sourceLabel}
                </span>
              ) : null}
            </div>
            <div className="text-right">
              {isFiltered && scopeLabel ? (
                <p className="text-[10px] text-muted-foreground">{scopeLabel}</p>
              ) : null}
              {showMoney && isFiltered && primaryCost !== fullCost ? (
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  всего {formatLocationCompactM(fullCost)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {annotation.comment ? (
          <div
            className="mt-2.5 rounded-md border-l-2 border-primary/55 bg-muted/35 px-2.5 py-2"
            title={annotation.comment}
          >
            <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
              {annotation.comment}
            </p>
          </div>
        ) : null}

        {annotation.inheritedFrom ? (
          <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            ↳ {annotation.inheritedFrom}
          </p>
        ) : null}

        <section className="mt-3 border-t border-border/60 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Рынки
            </p>
            <p className="text-[10px] text-muted-foreground">
              {marketCountLabel(markets.length)}
            </p>
          </div>

          {markets.length > 0 ? (
            <div className="divide-y divide-border/40 overflow-hidden rounded-md bg-muted/30">
              {visibleMarkets.map((market) => (
                <div
                  key={market.label}
                  className="flex min-w-0 items-baseline justify-between gap-2 px-2 py-1.5 text-[10px]"
                >
                  <span className="min-w-0 break-words font-medium leading-tight text-foreground/90">
                    {market.label}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="text-muted-foreground">
                      {percentLabel(market.rub, marketTotal)}
                    </span>
                    {showMoney ? (
                      <span className="ml-1.5 font-medium text-foreground/80">
                        {formatLocationCompactM(market.rub)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
              {remainingMarkets.length > 0 ? (
                <div className="flex min-w-0 items-baseline justify-between gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span className="min-w-0">
                    Ещё {marketCountLabel(remainingMarkets.length)}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {percentLabel(remainingMarketsRub, marketTotal)}
                    {showMoney ? (
                      <span className="ml-1.5">
                        {formatLocationCompactM(remainingMarketsRub)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Нет распределения по рынкам</p>
          )}
        </section>
      </div>
    </div>,
    document.body
  );
});
