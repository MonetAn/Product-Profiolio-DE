import { useCallback, useMemo, useRef } from 'react';
import { UsersRound } from 'lucide-react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import GanttView from '@/components/GanttView';
import { calculateTotalBudget, convertFromDB, type RawDataRow } from '@/lib/dataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  filterLocationTimelineInitiatives,
  initiativeFactByAllRegions,
  TOP_REGION_ORDER,
  TOP_REGION_SHORT_LABELS,
  type LocationTeamFilter,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { initiativeYearCostRub, quartersForYear } from '@/lib/locationAllocationModel';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { LocationAllocationInitiativePanelBody } from '@/components/admin/location-allocation/LocationAllocationInitiativePanelBody';
import type { LocationAllocationPanelCloseGuard } from '@/components/admin/location-allocation/LocationAllocationInitiativePanelBody';
import type { InitiativeTag } from '@/lib/initiativeTags';
import {
  locationTeamKey,
  type LocationHeadcountIndex,
} from '@/lib/locationAllocationPlanning';

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  regionFilter: TopRegionLabel | null;
  unitFilter: string | null;
  teamFilter: LocationTeamFilter | null;
  marketCountry?: MarketCountryRow | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  headcount: LocationHeadcountIndex;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  readOnly?: boolean;
};

function formatHeadlineRub(rub: number): string {
  return formatLocationCompactM(rub);
}

export function LocationAllocationTimeline({
  initiatives,
  year,
  regionFilter,
  unitFilter,
  teamFilter,
  marketCountry = null,
  countries,
  countryIdToClusterKey,
  headcount,
  onGeoCostSplitSave,
  onInitiativeTagsSave,
  readOnly = false,
}: Props) {
  const detailPanelCloseGuardRef = useRef<LocationAllocationPanelCloseGuard | null>(null);
  const filteredInitiatives = useMemo(
    () =>
      filterLocationTimelineInitiatives(initiatives, {
        year,
        region: regionFilter,
        unit: unitFilter,
        team: teamFilter,
        marketCountry,
        countries,
        countryIdToClusterKey,
      }),
    [initiatives, year, regionFilter, unitFilter, teamFilter, marketCountry, countries, countryIdToClusterKey]
  );

  const yearQuarters = useMemo(
    () => quartersForYear(filteredInitiatives, year),
    [filteredInitiatives, year]
  );

  const rawData = useMemo(
    () => convertFromDB(filteredInitiatives).rawData,
    [filteredInitiatives]
  );

  const yearCostByInitiativeId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredInitiatives) {
      const rub = initiativeYearCostRub(row, yearQuarters);
      if (rub > 0) map.set(row.id, rub);
    }
    return map;
  }, [filteredInitiatives, yearQuarters]);

  const regionBreakdownByInitiativeId = useMemo(() => {
    const map = new Map<string, Map<TopRegionLabel, number>>();
    for (const row of filteredInitiatives) {
      map.set(
        row.id,
        initiativeFactByAllRegions(row, yearQuarters, countries, countryIdToClusterKey)
      );
    }
    return map;
  }, [filteredInitiatives, yearQuarters, countries, countryIdToClusterKey]);

  const regionCostByInitiativeId = useMemo(() => {
    const map = new Map<string, number>();
    if (!regionFilter) return map;
    for (const row of filteredInitiatives) {
      map.set(row.id, regionBreakdownByInitiativeId.get(row.id)?.get(regionFilter) ?? 0);
    }
    return map;
  }, [filteredInitiatives, regionFilter, regionBreakdownByInitiativeId]);

  const regionPaymentTotal = useMemo(
    () => [...regionCostByInitiativeId.values()].reduce((s, v) => s + v, 0),
    [regionCostByInitiativeId]
  );

  const portfolioYearTotal = useMemo(
    () => [...yearCostByInitiativeId.values()].reduce((s, v) => s + v, 0),
    [yearCostByInitiativeId]
  );

  const regionPaymentRegions = useMemo(
    () =>
      TOP_REGION_ORDER.map((label) => ({
        label,
        shortLabel: TOP_REGION_SHORT_LABELS[label],
      })),
    []
  );

  const getRegionRubForRow = useCallback(
    (row: RawDataRow, regionLabel: string) => {
      const id = row.adminInitiativeRowId;
      if (!id) return 0;
      return regionBreakdownByInitiativeId.get(id)?.get(regionLabel as TopRegionLabel) ?? 0;
    },
    [regionBreakdownByInitiativeId]
  );

  const sortByCost = useCallback(
    (row: RawDataRow) => {
      const id = row.adminInitiativeRowId;
      if (!id) return calculateTotalBudget(row);
      if (regionFilter) return regionCostByInitiativeId.get(id) ?? 0;
      return yearCostByInitiativeId.get(id) ?? calculateTotalBudget(row);
    },
    [regionFilter, regionCostByInitiativeId, yearCostByInitiativeId]
  );

  const initiativeById = useMemo(
    () => new Map(initiatives.map((row) => [row.id, row])),
    [initiatives]
  );

  const renderDetailPanelBody = useCallback(
    ({ row }: { row: RawDataRow }) => {
      const id = row.adminInitiativeRowId;
      if (!id) return null;
      const initiative = initiativeById.get(id);
      if (!initiative) return null;
      return (
        <LocationAllocationInitiativePanelBody
          initiative={initiative}
          yearQuarters={yearQuarters}
          countries={countries}
          countryIdToClusterKey={countryIdToClusterKey}
          onGeoCostSplitSave={onGeoCostSplitSave}
          onInitiativeTagsSave={onInitiativeTagsSave}
          closeGuardRef={detailPanelCloseGuardRef}
          readOnly={readOnly}
        />
      );
    },
    [initiativeById, yearQuarters, countries, countryIdToClusterKey, onGeoCostSplitSave, onInitiativeTagsSave, readOnly]
  );

  const filterHint = (() => {
    const parts: string[] = [];
    if (regionFilter) parts.push(regionFilter);
    if (unitFilter) parts.push(unitFilter);
    if (teamFilter) parts.push(teamFilter.team);
    return parts.length > 0 ? parts.join(' · ') : 'все регионы';
  })();
  const scopeHeadcount = useMemo(() => {
    if (headcount.byUnit.size === 0) return null;
    if (teamFilter) {
      const value = headcount.byTeam.get(
        locationTeamKey(teamFilter.unit, teamFilter.team)
      );
      return value != null && value > 0 ? value : null;
    }
    if (unitFilter) {
      const value = headcount.byUnit.get(unitFilter);
      return value != null && value > 0 ? value : null;
    }
    const total = [...headcount.byUnit.values()].reduce(
      (sum, value) => sum + value,
      0
    );
    return total > 0 ? total : null;
  }, [headcount, teamFilter, unitFilter]);
  const hierarchyGrouping = useMemo(
    () =>
      teamFilter
        ? undefined
        : {
            mode: unitFilter ? ('team' as const) : ('unit-team' as const),
            headcountByUnit: headcount.byUnit,
            headcountByTeam: headcount.byTeam,
          },
    [headcount, teamFilter, unitFilter]
  );

  if (filteredInitiatives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Нет инициатив для выбранных фильтров.
      </p>
    );
  }

  if (yearQuarters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Нет данных по кварталам за {year}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <p>
            {filterHint} · {filteredInitiatives.length} иниц.
            {regionFilter
              ? ' · сортировка по платежу региона'
              : ' · сортировка по полной стоимости'}
          </p>
          {scopeHeadcount != null ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 font-medium tabular-nums text-foreground/75"
              title="Текущий состав по данным раздела «Люди», не историческое значение выбранного периода"
            >
              <UsersRound className="h-3 w-3" aria-hidden />
              {scopeHeadcount} чел. сейчас
            </span>
          ) : null}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {regionFilter ? (
            <>
              Полный бюджет:{' '}
              <span className="font-medium text-foreground">
                {formatHeadlineRub(portfolioYearTotal)}
              </span>
              {' · '}
              Факт региона:{' '}
              <span className="font-semibold text-foreground">
                {formatHeadlineRub(regionPaymentTotal)}
              </span>
            </>
          ) : (
            <>
              Полный бюджет:{' '}
              <span className="font-semibold text-foreground">
                {formatHeadlineRub(portfolioYearTotal)}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-border/70 overflow-hidden location-allocation-gantt min-h-[280px]">
        <GanttView
          rawData={rawData}
          selectedQuarters={yearQuarters}
          supportFilter="all"
          showOnlyOfftrack={false}
          hideStubs={false}
          selectedUnits={[]}
          selectedTeams={[]}
          selectedStakeholders={[]}
          showMoney
          costType="total"
          bypassTimelineFilters
          sortByCost={sortByCost}
          regionPaymentsAll={{
            regions: regionPaymentRegions,
            activeRegion: regionFilter,
            getRegionRub: getRegionRubForRow,
          }}
          fixedDetailPanel
          detailPanelCloseGuardRef={detailPanelCloseGuardRef}
          renderDetailPanelBody={renderDetailPanelBody}
          hierarchyGrouping={hierarchyGrouping}
        />
      </div>
    </div>
  );
}
