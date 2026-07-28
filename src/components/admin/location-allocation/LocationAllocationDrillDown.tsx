import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
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
  filterLocationTimelineInitiatives,
  TOP_REGION_DISPLAY_LABELS,
  type LocationTeamFilter,
  type RegionComparisonRow,
  type TeamRegionDetailRow,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { LocationAllocationMarketSection } from '@/components/admin/location-allocation/LocationAllocationMarketSection';
import { LocationAllocationTreemap } from '@/components/admin/location-allocation/LocationAllocationTreemap';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { InitiativeTag } from '@/lib/initiativeTags';
import type { Person, PersonAssignment } from '@/lib/peopleDataManager';
import type { LocationHeadcountIndex } from '@/lib/locationAllocationPlanning';
import { LocationAllocationFilterBar } from '@/components/admin/location-allocation/LocationAllocationFilterBar';
import type { LocationAllocationPeriodOption } from '@/lib/locationAllocationPeriod';
import { LocationAllocationTeamView } from '@/components/admin/location-allocation/LocationAllocationTeamView';
import type { LocationAllocationGeoEditScope } from '@/lib/locationAllocationGeoEdit';
import type { LocationAllocationTeamMetric } from '@/hooks/useLocationAllocationTeamMetrics';

type InitiativeDetailView = 'treemap' | 'timeline' | 'teams';

function currentRegionTotal(
  rows: RegionComparisonRow[],
  region: TopRegionLabel | null
): number {
  if (region) {
    return rows.find((row) => row.region === region)?.actualRub ?? 0;
  }
  return rows.reduce((sum, row) => sum + row.actualRub, 0);
}

type Props = {
  initiatives: AdminDataRow[];
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  year: number;
  period: string;
  defaultPeriod: string;
  periodLabel: string;
  periodOptions: LocationAllocationPeriodOption[];
  selectedQuarters: string[];
  onPeriodChange: (period: string) => void;
  onResetFilters: () => void;
  regionFilter: TopRegionLabel | null;
  onRegionFilterChange: (region: TopRegionLabel | null) => void;
  unitFilter: string | null;
  onUnitFilterChange: (unit: string | null) => void;
  teamFilter: string | null;
  onTeamFilterChange: (team: string | null, unit?: string | null) => void;
  marketCountry: MarketCountryRow | null;
  onMarketFilterChange: (country: MarketCountryRow | null) => void;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  people: Person[];
  assignments: PersonAssignment[];
  headcount: LocationHeadcountIndex;
  teamMetrics?: LocationAllocationTeamMetric[];
  readOnly?: boolean;
  focusedComment?: {
    id: string;
    scope: LocationAllocationGeoEditScope;
  } | null;
};

export function LocationAllocationDrillDown({
  initiatives,
  countries,
  countryIdToClusterKey,
  year,
  period,
  defaultPeriod,
  periodLabel,
  periodOptions,
  selectedQuarters,
  onPeriodChange,
  onResetFilters,
  regionFilter,
  onRegionFilterChange,
  unitFilter,
  onUnitFilterChange,
  teamFilter,
  onTeamFilterChange,
  marketCountry,
  onMarketFilterChange,
  onGeoCostSplitSave,
  onInitiativeTagsSave,
  people,
  assignments,
  headcount,
  teamMetrics = [],
  readOnly = false,
  focusedComment = null,
}: Props) {
  const [initiativeDetailView, setInitiativeDetailView] =
    useState<InitiativeDetailView>('treemap');
  const [treemapShowTeams, setTreemapShowTeams] = useState(false);
  const [treemapShowInitiatives, setTreemapShowInitiatives] = useState(false);
  const previousUnitFilterRef = useRef<string | null>(null);

  const visibleInitiatives = initiatives;

  const periodInitiatives = useMemo(
    () =>
      visibleInitiatives.map((row) => ({
        ...row,
        quarterlyData: Object.fromEntries(
          selectedQuarters
            .filter((quarter) => row.quarterlyData[quarter])
            .map((quarter) => [quarter, row.quarterlyData[quarter]])
        ),
      })),
    [visibleInitiatives, selectedQuarters]
  );

  const availableUnitDetailRows = useMemo(
    () =>
      regionFilter
        ? buildUnitRegionDetailRows(
            periodInitiatives,
            year,
            regionFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildUnitOverviewDetailRows(
            periodInitiatives,
            year,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [periodInitiatives, year, regionFilter, countries, countryIdToClusterKey, marketCountry]
  );

  const effectiveUnitFilter = useMemo(() => {
    if (!unitFilter) return null;
    return availableUnitDetailRows.some((r) => r.name === unitFilter)
      ? unitFilter
      : null;
  }, [unitFilter, availableUnitDetailRows]);

  const availableTeamDetailRows = useMemo(
    () =>
      regionFilter
        ? buildTeamRegionDetailRows(
            periodInitiatives,
            year,
            regionFilter,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildTeamOverviewDetailRows(
            periodInitiatives,
            year,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [
      periodInitiatives,
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
    const match = availableTeamDetailRows.find(
      (r) => r.unit === unitFilter && r.team === teamFilter
    );
    return match ? { unit: match.unit, team: match.team } : null;
  }, [teamFilter, unitFilter, availableTeamDetailRows]);

  const organizationalInitiatives = useMemo(
    () =>
      periodInitiatives.filter((row) => {
        const rowUnit = row.unit.trim() || 'Без юнита';
        const rowTeam = row.team.trim() || 'Без команды';
        if (effectiveUnitFilter && rowUnit !== effectiveUnitFilter) return false;
        if (
          effectiveTeamFilter &&
          (rowUnit !== effectiveTeamFilter.unit ||
            rowTeam !== effectiveTeamFilter.team)
        ) {
          return false;
        }
        return true;
      }),
    [periodInitiatives, effectiveUnitFilter, effectiveTeamFilter]
  );

  const regionRows = useMemo(
    () =>
      buildRegionComparisonRows(
        organizationalInitiatives,
        year,
        countries,
        countryIdToClusterKey,
        marketCountry
      ),
    [
      organizationalInitiatives,
      year,
      countries,
      countryIdToClusterKey,
      marketCountry,
    ]
  );
  const actualTotalRub = currentRegionTotal(regionRows, regionFilter);

  const parentInitiatives = useMemo(() => {
    if (effectiveTeamFilter) {
      return periodInitiatives.filter(
        (row) =>
          (row.unit.trim() || 'Без юнита') === effectiveTeamFilter.unit
      );
    }
    return effectiveUnitFilter ? periodInitiatives : null;
  }, [periodInitiatives, effectiveUnitFilter, effectiveTeamFilter]);

  const parentRegionRows = useMemo(
    () =>
      parentInitiatives
        ? buildRegionComparisonRows(
            parentInitiatives,
            year,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : null,
    [
      parentInitiatives,
      year,
      countries,
      countryIdToClusterKey,
      marketCountry,
    ]
  );
  const parentScope = parentRegionRows
    ? {
        label: effectiveTeamFilter
          ? effectiveTeamFilter.unit
          : 'Dodo Engineering',
        totalRub: currentRegionTotal(parentRegionRows, regionFilter),
      }
    : null;
  const budgetScopeLabel =
    effectiveTeamFilter?.team ?? effectiveUnitFilter ?? 'Dodo Engineering';
  const budgetFilterContext = [
    regionFilter ? TOP_REGION_DISPLAY_LABELS[regionFilter] : null,
    marketCountry?.label_ru,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  const unitDetailRows = useMemo(
    () =>
      regionFilter
        ? buildUnitRegionDetailRows(
            organizationalInitiatives,
            year,
            regionFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildUnitOverviewDetailRows(
            organizationalInitiatives,
            year,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [
      organizationalInitiatives,
      year,
      regionFilter,
      countries,
      countryIdToClusterKey,
      marketCountry,
    ]
  );

  const teamDetailRows = useMemo(
    () =>
      regionFilter
        ? buildTeamRegionDetailRows(
            organizationalInitiatives,
            year,
            regionFilter,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          )
        : buildTeamOverviewDetailRows(
            organizationalInitiatives,
            year,
            effectiveUnitFilter,
            countries,
            countryIdToClusterKey,
            marketCountry
          ),
    [
      organizationalInitiatives,
      year,
      regionFilter,
      effectiveUnitFilter,
      countries,
      countryIdToClusterKey,
      marketCountry,
    ]
  );

  const isOverviewMode = regionFilter == null;
  const teamViewInitiatives = useMemo(
    () =>
      filterLocationTimelineInitiatives(periodInitiatives, {
        year,
        region: regionFilter,
        unit: effectiveUnitFilter,
        team: effectiveTeamFilter,
        marketCountry,
        countries,
        countryIdToClusterKey,
      }),
    [
      periodInitiatives,
      year,
      regionFilter,
      effectiveUnitFilter,
      effectiveTeamFilter,
      marketCountry,
      countries,
      countryIdToClusterKey,
    ]
  );

  useEffect(() => {
    if (unitFilter !== previousUnitFilterRef.current) {
      const showNestedLevels = Boolean(unitFilter);
      setTreemapShowTeams(showNestedLevels);
      setTreemapShowInitiatives(showNestedLevels);
    }
    previousUnitFilterRef.current = unitFilter;
  }, [unitFilter]);

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

  const handleResetFilters = useCallback(() => {
    setTreemapShowTeams(false);
    setTreemapShowInitiatives(false);
    onResetFilters();
  }, [onResetFilters]);

  const handleTreemapNavigateToRoot = useCallback(() => {
    setTreemapShowTeams(false);
    setTreemapShowInitiatives(false);
    if (effectiveUnitFilter || effectiveTeamFilter) {
      onUnitFilterChange(null);
    }
  }, [effectiveTeamFilter, effectiveUnitFilter, onUnitFilterChange]);

  if (visibleInitiatives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Нет данных по инициативам за {year}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div id="location-initiatives" className="scroll-mt-4 space-y-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <LocationAllocationFilterBar
              initiatives={visibleInitiatives}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              periodOptions={periodOptions}
              period={period}
              defaultPeriod={defaultPeriod}
              onPeriodChange={onPeriodChange}
              onResetFilters={handleResetFilters}
              region={regionFilter}
              onRegionChange={onRegionFilterChange}
              unit={effectiveUnitFilter}
              onUnitChange={onUnitFilterChange}
              team={effectiveTeamFilter}
              onTeamChange={onTeamFilterChange}
              market={marketCountry}
              onMarketChange={onMarketFilterChange}
              showTeams={treemapShowTeams}
              onShowTeamsChange={setTreemapShowTeams}
              showInitiatives={treemapShowInitiatives}
              onShowInitiativesChange={setTreemapShowInitiatives}
            />
          </div>
          <ToggleGroup
            type="single"
            value={initiativeDetailView}
            onValueChange={(value) => {
              if (value === 'treemap' || value === 'timeline' || value === 'teams') {
                setInitiativeDetailView(value);
              }
            }}
            className="h-8 shrink-0 rounded-lg border border-border bg-secondary p-0.5"
            aria-label="Вид аллокаций"
          >
            <ToggleGroupItem
              value="treemap"
              className="h-7 rounded-md px-3 text-xs font-medium transition-all data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-primary"
            >
              Тримап
            </ToggleGroupItem>
            <ToggleGroupItem
              value="timeline"
              className="h-7 rounded-md px-3 text-xs font-medium transition-all data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-primary"
            >
              Таймлайн
            </ToggleGroupItem>
            <ToggleGroupItem
              value="teams"
              className="h-7 rounded-md px-3 text-xs font-medium transition-all data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-primary"
            >
              Таблица
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {initiativeDetailView === 'treemap' ? (
          <div className="-mx-4 sm:-mx-6">
            <LocationAllocationTreemap
              initiatives={periodInitiatives}
              year={year}
              regionFilter={regionFilter}
              unitFilter={effectiveUnitFilter}
              teamFilter={effectiveTeamFilter}
              marketCountry={marketCountry}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              headcount={headcount}
              onGeoCostSplitSave={onGeoCostSplitSave}
              onInitiativeTagsSave={onInitiativeTagsSave}
              showTeams={treemapShowTeams}
              onShowTeamsChange={setTreemapShowTeams}
              showInitiatives={treemapShowInitiatives}
              onShowInitiativesChange={setTreemapShowInitiatives}
              onNavigateToRoot={handleTreemapNavigateToRoot}
              focusedComment={focusedComment}
              readOnly={readOnly}
            />
          </div>
        ) : initiativeDetailView === 'timeline' ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <LocationAllocationTimeline
              initiatives={periodInitiatives}
              year={year}
              regionFilter={regionFilter}
              unitFilter={effectiveUnitFilter}
              teamFilter={effectiveTeamFilter}
              marketCountry={marketCountry}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              headcount={headcount}
              onGeoCostSplitSave={onGeoCostSplitSave}
              onInitiativeTagsSave={onInitiativeTagsSave}
              readOnly={readOnly}
            />
          </div>
        ) : (
          <LocationAllocationTeamView
            initiatives={visibleInitiatives}
            scopedInitiatives={teamViewInitiatives}
            selectedQuarters={selectedQuarters}
            people={people}
            assignments={assignments}
            headcount={headcount}
            countries={countries}
            countryIdToClusterKey={countryIdToClusterKey}
            teamMetrics={teamMetrics}
            readOnly={readOnly}
            selectedUnit={effectiveUnitFilter}
          />
        )}
      </div>

      <div className="border-t border-border/70 pt-4">
        <div className="space-y-4">
          <LocationRegionKpiCards
            year={year}
            periodLabel={periodLabel}
            scopeLabel={budgetScopeLabel}
            filterContextLabel={budgetFilterContext || undefined}
            parentScope={parentScope}
            totalRub={actualTotalRub}
            rows={regionRows}
            selectedRegion={regionFilter}
            onSelectRegion={onRegionFilterChange}
          />

          <LocationAllocationMarketSection
            initiatives={organizationalInitiatives}
            year={year}
            regionFilter={regionFilter}
            unitFilter={effectiveUnitFilter}
            teamFilter={effectiveTeamFilter}
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
                    effectiveTeamFilter?.unit === t.unit &&
                    effectiveTeamFilter?.team === t.team
                  );
                }}
                onSelectRow={(row) => handleTeamSelect(row as TeamRegionDetailRow)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
