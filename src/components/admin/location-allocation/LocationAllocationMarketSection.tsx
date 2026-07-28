import { useMemo } from 'react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { LocationRegionEntityRankedList } from '@/components/admin/location-allocation/LocationUnitRegionRankedList';
import {
  TOP_REGION_DISPLAY_LABELS,
  buildMarketDetailRows,
  type LocationTeamFilter,
  type MarketDetailRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  regionFilter: TopRegionLabel | null;
  unitFilter: string | null;
  teamFilter: LocationTeamFilter | null;
  marketCountry: MarketCountryRow | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onMarketSelect: (country: MarketCountryRow | null) => void;
};

export function LocationAllocationMarketSection({
  initiatives,
  year,
  regionFilter,
  unitFilter,
  teamFilter,
  marketCountry,
  countries,
  countryIdToClusterKey,
  onMarketSelect,
}: Props) {
  const portfolioMarketRows = useMemo(
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
  const unitInitiatives = useMemo(
    () =>
      unitFilter
        ? initiatives.filter(
            (row) => (row.unit.trim() || 'Без юнита') === unitFilter
          )
        : initiatives,
    [initiatives, unitFilter]
  );
  const unitMarketRows = useMemo(
    () =>
      buildMarketDetailRows(
        unitInitiatives,
        year,
        regionFilter,
        countries,
        countryIdToClusterKey
      ),
    [unitInitiatives, year, regionFilter, countries, countryIdToClusterKey]
  );
  const teamInitiatives = useMemo(
    () =>
      teamFilter
        ? initiatives.filter(
            (row) =>
              (row.unit.trim() || 'Без юнита') === teamFilter.unit &&
              (row.team.trim() || 'Без команды') === teamFilter.team
          )
        : unitInitiatives,
    [initiatives, teamFilter, unitInitiatives]
  );
  const teamMarketRows = useMemo(
    () =>
      buildMarketDetailRows(
        teamInitiatives,
        year,
        regionFilter,
        countries,
        countryIdToClusterKey
      ),
    [teamInitiatives, year, regionFilter, countries, countryIdToClusterKey]
  );
  const marketRows = teamFilter
    ? teamMarketRows
    : unitFilter
      ? unitMarketRows
      : portfolioMarketRows;

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
  const contextParts = [
    regionHint,
    unitFilter,
    teamFilter?.team,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <LocationRegionEntityRankedList
        titleLabel="Детализация по рынкам"
        contextLabel={contextParts.join(' · ')}
        overviewMode={marketOverviewMode}
        showEntityShareColumn={false}
        entityColumnLabel="Рынок"
        countSuffix="рын."
        emptyMessage={
          teamFilter
            ? 'Нет аллокаций по рынкам выбранной команды.'
            : unitFilter
              ? 'Нет аллокаций по рынкам выбранного юнита.'
              : regionFilter
                ? 'Нет аллокаций по рынкам выбранного региона.'
                : 'Нет аллокаций по рынкам.'
        }
        rows={marketRows}
        scrollable
        isRowSelected={(row) =>
          marketCountry?.id === (row as MarketDetailRow).countryId
        }
        onSelectRow={(row) => handleMarketSelect(row as MarketDetailRow)}
      />
    </div>
  );
}
