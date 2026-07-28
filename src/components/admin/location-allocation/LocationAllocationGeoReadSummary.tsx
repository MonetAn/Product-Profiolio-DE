import { Pencil } from 'lucide-react';
import type { GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  buildGeoHierarchy,
  regionDisplayLabel,
} from '@/lib/locationAllocationGeoEdit';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { Button } from '@/components/ui/button';

type Props = {
  split: GeoCostSplit | undefined;
  totalCostRub: number;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onEdit?: () => void;
};

function allocationSourceLabel(split: GeoCostSplit | undefined): string | null {
  if (!split?.entries.length) return null;
  const revenuePct = split.entries.reduce(
    (sum, entry) =>
      sum + (entry.allocationSource === 'revenue' ? entry.percent : 0),
    0
  );
  const manualPct = split.entries.reduce(
    (sum, entry) =>
      sum + (entry.allocationSource === 'revenue' ? 0 : entry.percent),
    0
  );
  const total = revenuePct + manualPct;
  if (total <= 0) return null;
  if (manualPct <= 0) return 'По выручке';
  if (revenuePct <= 0) return 'Вручную';
  return `Выручка ${Math.round((revenuePct / total) * 100)}% · вручную ${Math.round(
    (manualPct / total) * 100
  )}%`;
}

export function LocationAllocationGeoReadSummary({
  split,
  totalCostRub,
  countries,
  countryIdToClusterKey,
  onEdit,
}: Props) {
  const hierarchy = buildGeoHierarchy(
    split,
    totalCostRub,
    countries,
    countryIdToClusterKey
  );
  const markets = hierarchy
    .flatMap((region) => region.markets)
    .filter((market) => market.percent > 0 || market.rub > 0)
    .sort(
      (a, b) =>
        b.rub - a.rub ||
        b.percent - a.percent ||
        a.label.localeCompare(b.label, 'ru')
    );
  const sourceLabel = allocationSourceLabel(split);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Распределение по рынкам
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <strong className="font-semibold tabular-nums text-foreground">
              {totalCostRub > 0
                ? formatLocationCompactM(totalCostRub)
                : '—'}
            </strong>
            {sourceLabel ? (
              <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium">
                {sourceLabel}
              </span>
            ) : null}
          </div>
        </div>
        {onEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Изменить распределение
          </Button>
        ) : null}
      </div>

      {totalCostRub > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {hierarchy.map((region) => (
            <div
              key={region.region}
              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
            >
              <p className="text-[10px] font-medium leading-tight text-muted-foreground">
                {regionDisplayLabel(region.region)}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-sm font-semibold tabular-nums">
                  {region.percent}%
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatLocationCompactM(region.rub)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/25 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Рынки
          </p>
          <p className="text-[10px] tabular-nums text-muted-foreground">
            {markets.length}
          </p>
        </div>

        {markets.length > 0 ? (
          <div className="grid grid-cols-1 gap-px bg-border/50 sm:grid-cols-2">
            {markets.map((market) => (
              <div
                key={market.countryId}
                className="flex min-w-0 items-baseline justify-between gap-3 bg-card px-3 py-2"
              >
                <span className="min-w-0 break-words text-xs font-medium leading-snug text-foreground/90">
                  {market.label}
                </span>
                <span className="shrink-0 text-right text-[11px] tabular-nums">
                  <strong className="font-semibold text-foreground">
                    {market.percent}%
                  </strong>
                  <span className="ml-1.5 text-muted-foreground">
                    {formatLocationCompactM(market.rub)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Нет распределения по рынкам.
          </p>
        )}
      </div>
    </section>
  );
}
