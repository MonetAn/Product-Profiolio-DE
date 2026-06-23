import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  applyMarketPercentChange,
  applyRegionPercentChange,
  buildGeoHierarchy,
  regionDisplayLabel,
  sumHierarchyPercents,
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
      className={cn(
        'h-7 w-[4.25rem] px-1.5 text-right tabular-nums text-xs',
        '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className
      )}
    />
  );
}

function ColumnHeaders({ totalPct }: { totalPct: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <span className="min-w-0 flex-1">Рынок</span>
      <span
        className={cn(
          'w-[4.25rem] shrink-0 text-right tabular-nums sm:w-[4.5rem]',
          totalPct !== 100 && 'text-amber-600 dark:text-amber-500'
        )}
      >
        Σ {totalPct}%
      </span>
      <span className="w-[4.5rem] shrink-0 text-right">₽</span>
    </div>
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

  const totalPct = useMemo(() => sumHierarchyPercents(hierarchy), [hierarchy]);

  if (totalCostRub <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        При нулевой стоимости распределение не задаётся.
      </p>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Справочник рынков пуст.</p>
    );
  }

  const handleRegion = (region: (typeof hierarchy)[0]['region'], percent: number) => {
    onChange(
      applyRegionPercentChange(split, region, percent, countries, countryIdToClusterKey)
    );
  };

  const handleMarket = (countryId: string, percent: number) => {
    onChange(
      applyMarketPercentChange(split, countryId, percent, countries, countryIdToClusterKey)
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/70 overflow-hidden">
        <ColumnHeaders totalPct={totalPct} />

        <div className="divide-y divide-border/60">
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
                <ul className="divide-y divide-border/40 bg-background/80">
                  {region.markets.map((market) => (
                    <li
                      key={market.countryId}
                      className="flex items-center gap-2 px-3 py-1.5 pl-8 text-xs"
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          market.percent > 0 ? 'text-foreground/90' : 'text-muted-foreground/80'
                        )}
                      >
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
      </div>

      {totalPct !== 100 ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Сумма по всем рынкам: {totalPct}% (для сохранения нужно 100%).
        </p>
      ) : null}
    </div>
  );
}
