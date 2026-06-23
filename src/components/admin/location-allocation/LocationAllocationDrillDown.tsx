import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import type { RawDataRow } from '@/lib/dataManager';
import { useSensitiveDashboardMask } from '@/hooks/useSensitiveDashboardMask';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { LocationRegionKpiCards } from '@/components/admin/location-allocation/LocationRegionKpiCards';
import { LocationAllocationTimeline } from '@/components/admin/location-allocation/LocationAllocationTimeline';
import { LocationRegionEntityRankedList } from '@/components/admin/location-allocation/LocationUnitRegionRankedList';
import {
  buildRegionComparisonRows,
  buildTeamOverviewDetailRows,
  buildTeamRegionDetailRows,
  buildUnitOverviewDetailRows,
  buildUnitRegionDetailRows,
  countryBelongsToTopRegion,
  type LocationTeamFilter,
  type TeamRegionDetailRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { LocationAllocationMarketSection } from '@/components/admin/location-allocation/LocationAllocationMarketSection';
import { LocationAllocationTreemap } from '@/components/admin/location-allocation/LocationAllocationTreemap';
import { LocationAllocationSunburst } from '@/components/admin/location-allocation/LocationAllocationSunburst';
import { dashboardSensitiveRowKey } from '@/lib/sensitiveScopes';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type InitiativeDetailView = 'treemap' | 'timeline' | 'sunburst';

const EMPTY_SENSITIVE = new Set<string>();

function initiativesForSensitiveMask(initiatives: AdminDataRow[]): RawDataRow[] {
  return initiatives.map((row) => ({
    unit: row.unit,
    team: row.team,
    initiative: row.initiative,
    description: row.description ?? '',
    stakeholders: row.stakeholders ?? '',
    quarterlyData: {},
  }));
}

type Props = {
  initiatives: AdminDataRow[];
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  year: number;
  regionFilter: TopRegionLabel | null;
  onRegionFilterChange: (region: TopRegionLabel | null) => void;
  unitFilter: string | null;
  onUnitFilterChange: (unit: string | null) => void;
  teamFilter: string | null;
  onTeamFilterChange: (team: string | null, unit?: string | null) => void;
  marketCountry: MarketCountryRow | null;
  onMarketFilterChange: (country: MarketCountryRow | null) => void;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
};

export function LocationAllocationDrillDown({
  initiatives,
  countries,
  countryIdToClusterKey,
  year,
  regionFilter,
  onRegionFilterChange,
  unitFilter,
  onUnitFilterChange,
  teamFilter,
  onTeamFilterChange,
  marketCountry,
  onMarketFilterChange,
  onGeoCostSplitSave,
}: Props) {
  const [initiativeDetailView, setInitiativeDetailView] =
    useState<InitiativeDetailView>('treemap');

  const maskInput = useMemo(() => initiativesForSensitiveMask(initiatives), [initiatives]);
  const {
    data: sensitiveKeySet,
    isPending: sensitiveMaskPending,
    isError: sensitiveMaskError,
  } = useSensitiveDashboardMask(maskInput, true);
  const sensitiveKeys = sensitiveKeySet ?? EMPTY_SENSITIVE;

  const visibleInitiatives = useMemo(() => {
    if (sensitiveMaskPending || sensitiveMaskError) return [];
    return initiatives.filter(
      (row) => !sensitiveKeys.has(dashboardSensitiveRowKey(row.unit, row.team))
    );
  }, [initiatives, sensitiveKeys, sensitiveMaskPending, sensitiveMaskError]);

  const regionRows = useMemo(
    () =>
      buildRegionComparisonRows(
        visibleInitiatives,
        year,
        countries,
        countryIdToClusterKey
      ),
    [visibleInitiatives, year, countries, countryIdToClusterKey]
  );

  const actualTotalRub = regionRows.reduce((s, r) => s + r.actualRub, 0);

  const unitDetailRows = useMemo(
    () =>
      regionFilter
        ? buildUnitRegionDetailRows(
            visibleInitiatives,
            year,
            regionFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildUnitOverviewDetailRows(
            visibleInitiatives,
            year,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [visibleInitiatives, year, regionFilter, countries, countryIdToClusterKey, marketCountry]
  );

  const effectiveUnitFilter = useMemo(() => {
    if (!unitFilter) return null;
    return unitDetailRows.some((r) => r.name === unitFilter) ? unitFilter : null;
  }, [unitFilter, unitDetailRows]);

  const teamDetailRows = useMemo(
    () =>
      regionFilter
        ? buildTeamRegionDetailRows(
            visibleInitiatives,
            year,
            regionFilter,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildTeamOverviewDetailRows(
            visibleInitiatives,
            year,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [
      visibleInitiatives,
      year,
      regionFilter,
      effectiveUnitFilter,
      countries,
      countryIdToClusterKey,
      marketCountry,
    ]
  );

  const effectiveTeamFilter = useMemo((): LocationTeamFilter | null => {
    if (!teamFilter || !unitFilter) return null;
    const match = teamDetailRows.find((r) => r.unit === unitFilter && r.team === teamFilter);
    return match ? { unit: match.unit, team: match.team } : null;
  }, [teamFilter, unitFilter, teamDetailRows]);

  const isOverviewMode = regionFilter == null;

  useEffect(() => {
    if (unitFilter && !effectiveUnitFilter) {
      onUnitFilterChange(null);
    }
  }, [unitFilter, effectiveUnitFilter, onUnitFilterChange]);

  useEffect(() => {
    if (teamFilter && !effectiveTeamFilter) {
      onTeamFilterChange(null);
    }
  }, [teamFilter, effectiveTeamFilter, onTeamFilterChange]);

  useEffect(() => {
    if (
      marketCountry &&
      regionFilter &&
      !countryBelongsToTopRegion(marketCountry, regionFilter, countryIdToClusterKey)
    ) {
      onMarketFilterChange(null);
    }
  }, [marketCountry, regionFilter, countryIdToClusterKey, onMarketFilterChange]);

  const handleTeamSelect = useCallback(
    (row: TeamRegionDetailRow) => {
      const isSelected =
        effectiveTeamFilter?.unit === row.unit && effectiveTeamFilter?.team === row.team;
      if (isSelected) {
        onTeamFilterChange(null);
      } else {
        onTeamFilterChange(row.team, row.unit);
      }
    },
    [effectiveTeamFilter, onTeamFilterChange]
  );

  if (sensitiveMaskPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Загрузка…
      </div>
    );
  }

  if (sensitiveMaskError) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        Не удалось загрузить маску sensitive. Обновите страницу.
      </p>
    );
  }

  if (visibleInitiatives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Нет данных по инициативам за {year}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <LocationRegionKpiCards
        year={year}
        totalRub={actualTotalRub}
        rows={regionRows}
        selectedRegion={regionFilter}
        onSelectRegion={onRegionFilterChange}
      />

      <LocationAllocationMarketSection
        initiatives={visibleInitiatives}
        year={year}
        regionFilter={regionFilter}
        marketCountry={marketCountry}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
        onMarketSelect={onMarketFilterChange}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
          <LocationRegionEntityRankedList
            titleLabel="Детализация по юнитам"
            overviewMode={isOverviewMode}
            entityColumnLabel="Юнит"
            countSuffix="юн."
            emptyMessage="Нет сумм по юнитам."
            rows={unitDetailRows}
            selectedName={effectiveUnitFilter}
            onSelect={(name) =>
              onUnitFilterChange(effectiveUnitFilter === name ? null : name)
            }
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
          <LocationRegionEntityRankedList
            titleLabel="Детализация по командам"
            contextLabel={effectiveUnitFilter}
            overviewMode={isOverviewMode}
            entityColumnLabel="Команда"
            countSuffix="ком."
            emptyMessage={
              effectiveUnitFilter
                ? 'Нет сумм по командам выбранного юнита.'
                : 'Нет сумм по командам.'
            }
            rows={teamDetailRows}
            scrollable
            isRowSelected={(row) => {
              const t = row as TeamRegionDetailRow;
              return (
                effectiveTeamFilter?.unit === t.unit && effectiveTeamFilter?.team === t.team
              );
            }}
            onSelectRow={(row) => handleTeamSelect(row as TeamRegionDetailRow)}
          />
        </div>
      </div>

      <div id="location-initiatives" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold tracking-tight">Детализация по инициативам</p>
          <ToggleGroup
            type="single"
            value={initiativeDetailView}
            onValueChange={(value) => {
              if (value === 'treemap' || value === 'timeline' || value === 'sunburst') {
                setInitiativeDetailView(value);
              }
            }}
            className="h-8 rounded-lg border border-border bg-muted/30 p-0.5"
          >
            <ToggleGroupItem value="treemap" className="h-7 px-3 text-xs">
              Тримап
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline" className="h-7 px-3 text-xs">
              Таймлайн
            </ToggleGroupItem>
            <ToggleGroupItem value="sunburst" className="h-7 px-3 text-xs">
              Круговой
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {initiativeDetailView === 'treemap' ? (
          <div className="-mx-4 sm:-mx-6">
            <LocationAllocationTreemap
              initiatives={visibleInitiatives}
              year={year}
              regionFilter={regionFilter}
              unitFilter={effectiveUnitFilter}
              teamFilter={effectiveTeamFilter}
              marketCountry={marketCountry}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              onGeoCostSplitSave={onGeoCostSplitSave}
            />
          </div>
        ) : initiativeDetailView === 'timeline' ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <LocationAllocationTimeline
              initiatives={visibleInitiatives}
              year={year}
              regionFilter={regionFilter}
              unitFilter={effectiveUnitFilter}
              teamFilter={effectiveTeamFilter}
              marketCountry={marketCountry}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              onGeoCostSplitSave={onGeoCostSplitSave}
            />
          </div>
        ) : (
          <div className="-mx-4 sm:-mx-6">
            <LocationAllocationSunburst
              initiatives={visibleInitiatives}
              year={year}
              unitFilter={effectiveUnitFilter}
              teamFilter={effectiveTeamFilter}
              marketCountry={marketCountry}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
            />
          </div>
        )}
      </div>
    </section>
  );
}
