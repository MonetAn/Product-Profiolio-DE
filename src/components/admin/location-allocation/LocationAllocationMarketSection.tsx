import { useMemo } from 'react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { LocationRegionEntityRankedList } from '@/components/admin/location-allocation/LocationUnitRegionRankedList';
import {
  TOP_REGION_DISPLAY_LABELS,
  buildMarketDetailRows,
  type MarketDetailRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  regionFilter: TopRegionLabel | null;
  marketCountry: MarketCountryRow | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onMarketSelect: (country: MarketCountryRow | null) => void;
};

export function LocationAllocationMarketSection({
  initiatives,
  year,
  regionFilter,
  marketCountry,
  countries,
  countryIdToClusterKey,
  onMarketSelect,
}: Props) {
  const marketRows = useMemo(
    () =>
      buildMarketDetailRows(
        initiatives,
        year,
        regionFilter,
        countries,
        countryIdToClusterKey
      ),
    [initiatives, year, regionFilter, countries, countryIdToClusterKey]
  );

  const marketOverviewMode = regionFilter == null;

  const handleMarketSelect = (row: MarketDetailRow) => {
    const country = countries.find((c) => c.id === row.countryId) ?? null;
    if (!country) return;
    if (marketCountry?.id === country.id) onMarketSelect(null);
    else onMarketSelect(country);
  };

  const regionHint = regionFilter
    ? TOP_REGION_DISPLAY_LABELS[regionFilter]
    : 'все регионы';

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <LocationRegionEntityRankedList
        titleLabel="Детализация по рынкам"
        contextLabel={regionHint}
        overviewMode={marketOverviewMode}
        showEntityShareColumn={false}
        entityColumnLabel="Рынок"
        countSuffix="рын."
        emptyMessage={
          regionFilter
            ? 'Нет аллокаций по рынкам выбранного региона.'
            : 'Нет аллокаций по рынкам.'
        }
        rows={marketRows}
        scrollable
        isRowSelected={(row) => marketCountry?.id === (row as MarketDetailRow).countryId}
        onSelectRow={(row) => handleMarketSelect(row as MarketDetailRow)}
      />
    </div>
  );
}
