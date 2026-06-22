import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  applyClusterPercentChange,
  applyMarketPercentChange,
  applyRegionPercentChange,
  buildGeoHierarchy,
  geoSplitPercentTotal,
  regionDisplayLabel,
  type GeoHierarchyRegionRow,
} from '@/lib/locationAllocationGeoEdit';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  split: GeoCostSplit | undefined;
  totalCostRub: number;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onChange: (next: GeoCostSplit | undefined) => void;
  disabled?: boolean;
};

function PercentInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Input
      type="number"
      min={0}
      max={100}
      step={1}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Math.round(Number(e.target.value) || 0))}
      className={cn('h-7 w-[4.25rem] px-1.5 text-right tabular-nums text-xs', className)}
    />
  );
}

export function LocationAllocationHierarchicalGeoEditor({
  split,
  totalCostRub,
  countries,
  countryIdToClusterKey,
  onChange,
  disabled = false,
}: Props) {
  const hierarchy = useMemo(
    () => buildGeoHierarchy(split, totalCostRub, countries, countryIdToClusterKey),
    [split, totalCostRub, countries, countryIdToClusterKey]
  );

  const totalPct = geoSplitPercentTotal(split);

  if (totalCostRub <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        При нулевой стоимости распределение не задаётся.
      </p>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет рынков в распределении. Задайте доли на уровне региона или кластера.
      </p>
    );
  }

  const handleRegion = (region: GeoHierarchyRegionRow['region'], percent: number) => {
    onChange(
      applyRegionPercentChange(
        split,
        region,
        percent,
        totalCostRub,
        countries,
        countryIdToClusterKey
      )
    );
  };

  const handleCluster = (clusterLabel: string, percent: number) => {
    onChange(
      applyClusterPercentChange(
        split,
        clusterLabel,
        percent,
        totalCostRub,
        countries,
        countryIdToClusterKey
      )
    );
  };

  const handleMarket = (countryId: string, percent: number) => {
    onChange(
      applyMarketPercentChange(split, countryId, percent, countries, countryIdToClusterKey)
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Регион → кластер → рынок. Изменение рынков пересчитывает уровни выше.</span>
        <span className="tabular-nums">
          Σ {totalPct}%
          {totalPct !== 100 ? (
            <span className="ml-1 text-amber-600 dark:text-amber-500">· ожидается 100%</span>
          ) : null}
        </span>
      </div>

      <div className="rounded-lg border border-border/70 divide-y divide-border/60 overflow-hidden">
        {hierarchy.map((region) => (
          <Collapsible key={region.region} defaultOpen>
            <div className="bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-semibold text-foreground"
                  >
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                    <span className="truncate">{regionDisplayLabel(region.region)}</span>
                  </button>
                </CollapsibleTrigger>
                <PercentInput
                  value={region.percent}
                  disabled={disabled}
                  onChange={(v) => handleRegion(region.region, v)}
                />
                <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatLocationCompactM(region.rub)}
                </span>
              </div>
            </div>

            <CollapsibleContent>
              <div className="divide-y divide-border/40 bg-background/80">
                {region.clusters.map((cluster) => (
                  <Collapsible key={cluster.clusterLabel} defaultOpen={region.clusters.length <= 2}>
                    <div className="px-3 py-2 pl-6">
                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="group flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-foreground/90"
                          >
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                            <span className="truncate">{cluster.clusterLabel}</span>
                          </button>
                        </CollapsibleTrigger>
                        <PercentInput
                          value={cluster.percent}
                          disabled={disabled}
                          onChange={(v) => handleCluster(cluster.clusterLabel, v)}
                        />
                        <span className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {formatLocationCompactM(cluster.rub)}
                        </span>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <ul className="pb-1">
                        {cluster.markets.map((market) => (
                          <li
                            key={market.countryId}
                            className="flex items-center gap-2 px-3 py-1.5 pl-10 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {market.label}
                            </span>
                            <PercentInput
                              value={market.percent}
                              disabled={disabled}
                              onChange={(v) => handleMarket(market.countryId, v)}
                            />
                            <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-muted-foreground">
                              {formatLocationCompactM(market.rub)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
