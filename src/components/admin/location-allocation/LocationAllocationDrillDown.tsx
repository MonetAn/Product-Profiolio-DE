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
  type LocationTeamFilter,
  type TeamRegionDetailRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { LocationAllocationTreemap } from '@/components/admin/location-allocation/LocationAllocationTreemap';
import { dashboardSensitiveRowKey } from '@/lib/sensitiveScopes';

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
  onGeoCostSplitSave,
}: Props) {
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
            countryIdToClusterKey
          )
        : buildUnitOverviewDetailRows(
            visibleInitiatives,
            year,
            countries,
            countryIdToClusterKey
          ),
    [visibleInitiatives, year, regionFilter, countries, countryIdToClusterKey]
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
            countryIdToClusterKey
          )
        : buildTeamOverviewDetailRows(
            visibleInitiatives,
            year,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey
          ),
    [
      visibleInitiatives,
      year,
      regionFilter,
      effectiveUnitFilter,
      countries,
      countryIdToClusterKey,
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

      <div id="location-treemap" className="scroll-mt-4 space-y-3">
        <p className="text-sm font-semibold tracking-tight px-0 sm:px-0">
          Детализация по инициативам
        </p>
        <div className="-mx-4 sm:-mx-6">
          <LocationAllocationTreemap
            initiatives={visibleInitiatives}
            year={year}
            unitFilter={effectiveUnitFilter}
            teamFilter={effectiveTeamFilter}
            countries={countries}
            countryIdToClusterKey={countryIdToClusterKey}
            onGeoCostSplitSave={onGeoCostSplitSave}
          />
        </div>
      </div>

      <div id="location-initiatives" className="rounded-xl border border-border bg-card p-4 scroll-mt-4">
        <div className="mb-3">
          <p className="text-sm font-semibold tracking-tight">Таймлайн инициатив</p>
        </div>

        <LocationAllocationTimeline
          initiatives={visibleInitiatives}
          year={year}
          regionFilter={regionFilter}
          unitFilter={effectiveUnitFilter}
          teamFilter={effectiveTeamFilter}
          countries={countries}
          countryIdToClusterKey={countryIdToClusterKey}
          onGeoCostSplitSave={onGeoCostSplitSave}
        />
      </div>
    </section>
  );
}
