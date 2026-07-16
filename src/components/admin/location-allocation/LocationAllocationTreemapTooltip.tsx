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
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

function percentLabel(part: number, whole: number): string {
  const value = percent(part, whole);
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
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
  onMouseEnter,
  onMouseLeave,
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
  const sourceTotal = allocationSource.revenueRub + allocationSource.manualRub;
  const marketTotal = markets.reduce((sum, market) => sum + market.rub, 0);
  const revenueWidth = percent(allocationSource.revenueRub, sourceTotal);
  const manualWidth = Math.max(0, 100 - revenueWidth);

  const breadcrumb = [
    node.data.unit && !node.isUnit ? node.data.unit : null,
    node.data.team && !node.isTeam ? node.data.team : null,
  ].filter((part): part is string => Boolean(part));

  return createPortal(
    <div
      ref={tooltipRef}
      className="location-allocation-treemap-tooltip pointer-events-auto fixed z-[9999] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        left: position?.x ?? data.position.x + CURSOR_OFFSET,
        top: position?.y ?? data.position.y + CURSOR_OFFSET,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="px-3.5 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {breadcrumb.length > 0 ? (
              <p className="mb-0.5 truncate text-[10px] text-muted-foreground">
                {breadcrumb.join(' › ')}
              </p>
            ) : null}
            <p className="truncate text-sm font-semibold leading-tight">{node.name}</p>
          </div>
          <div className="shrink-0 text-right">
            {showMoney ? (
              <p className="text-sm font-semibold tabular-nums">
                {formatLocationCompactM(primaryCost)}
              </p>
            ) : null}
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

        {annotation.comment ? (
          <div className="mt-2.5 max-h-[104px] overflow-y-auto rounded-md border-l-2 border-primary/55 bg-muted/35 px-2.5 py-2">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
              {annotation.comment}
            </p>
          </div>
        ) : null}

        {annotation.inheritedFrom ? (
          <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            ↳ {annotation.inheritedFrom}
          </p>
        ) : null}

        {sourceTotal > 0 ? (
          <section className="mt-3 border-t border-border/60 pt-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Как распределено
              </p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {percentLabel(allocationSource.revenueRub, sourceTotal)} по выручке
              </p>
            </div>

            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {allocationSource.revenueRub > 0 ? (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${revenueWidth}%` }}
                />
              ) : null}
              {allocationSource.manualRub > 0 ? (
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${manualWidth}%` }}
                />
              ) : null}
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-300">По выручке</p>
                <p className="tabular-nums text-muted-foreground">
                  {showMoney ? `${formatLocationCompactM(allocationSource.revenueRub)} · ` : null}
                  {percentLabel(allocationSource.revenueRub, sourceTotal)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-indigo-700 dark:text-indigo-300">Вручную</p>
                <p className="tabular-nums text-muted-foreground">
                  {showMoney ? `${formatLocationCompactM(allocationSource.manualRub)} · ` : null}
                  {percentLabel(allocationSource.manualRub, sourceTotal)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-3 border-t border-border/60 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              По рынкам
            </p>
            <p className="text-[10px] text-muted-foreground">
              {marketCountLabel(markets.length)}
            </p>
          </div>

          {markets.length > 0 ? (
            <div className="max-h-[220px] space-y-1 overflow-y-auto pr-0.5">
              {markets.map((market) => {
                const marketPct = percent(market.rub, marketTotal);
                return (
                  <div
                    key={market.label}
                    className="relative overflow-hidden rounded-md bg-muted/30 px-2 py-1.5"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/[0.08]"
                      style={{ width: `${marketPct}%` }}
                    />
                    <div className="relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 text-[11px]">
                      <span className="truncate font-medium text-foreground/90">
                        {market.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {percentLabel(market.rub, marketTotal)}
                      </span>
                      {showMoney ? (
                        <span className="min-w-[4.5rem] text-right tabular-nums">
                          {formatLocationCompactM(market.rub)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
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
