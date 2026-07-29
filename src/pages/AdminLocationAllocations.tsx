import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header, { type ViewType } from '@/components/Header';
import { LocationAllocationDrillDown } from '@/components/admin/location-allocation/LocationAllocationDrillDown';
import { buildCountryIdToClusterMap } from '@/hooks/useMarketCountries';
import type { GeoCostSplit } from '@/lib/adminDataManager';
import {
  topRegionFromUrlSlug,
  topRegionToUrlSlug,
  teamFromUrlParam,
  teamToUrlParam,
  unitFromUrlParam,
  unitToUrlParam,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { excludePortfolioGhostRows } from '@/lib/portfolioVisibility';
import type { InitiativeTag } from '@/lib/initiativeTags';
import { buildLocationHeadcountIndex } from '@/lib/locationAllocationPlanning';
import {
  useLocationAllocationGeoSplitMutation,
  useLocationAllocationWorkspace,
} from '@/hooks/useLocationAllocationWorkspace';
import { useAccess } from '@/hooks/useAccess';
import {
  buildLocationAllocationPeriodOptions,
  resolveLocationAllocationPeriod,
  resolveLocationAllocationDatasetQuarters,
  type LocationAllocationPeriodOption,
} from '@/lib/locationAllocationPeriod';

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_ALLOCATION_UNIT = 'Data Office';

export default function AdminLocationAllocations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultUnitAppliedRef = useRef(false);
  const { isAdmin, hasEarlyAccess } = useAccess();
  const regionFilter = topRegionFromUrlSlug(searchParams.get('region') || '');
  const unitFilter = unitFromUrlParam(searchParams.get('unit') || '');
  const teamFilter = teamFromUrlParam(searchParams.get('team') || '');
  const marketCountryId = searchParams.get('market') || '';
  const focusedComment = useMemo(() => {
    const id = searchParams.get('comment')?.trim() ?? '';
    const scopeType = searchParams.get('commentScope');
    if (!id) return null;
    if (scopeType === 'initiative') {
      const initiativeId = searchParams.get('initiative')?.trim() ?? '';
      return initiativeId
        ? {
            id,
            scope: {
              type: 'initiative' as const,
              initiativeId,
            },
          }
        : null;
    }
    if (scopeType === 'team' && unitFilter && teamFilter) {
      return {
        id,
        scope: {
          type: 'team' as const,
          unit: unitFilter,
          team: teamFilter,
        },
      };
    }
    if (scopeType === 'unit' && unitFilter) {
      return {
        id,
        scope: {
          type: 'unit' as const,
          unit: unitFilter,
        },
      };
    }
    return null;
  }, [searchParams, teamFilter, unitFilter]);

  const {
    data: workspace,
    isLoading,
    isError,
    error,
  } = useLocationAllocationWorkspace();
  const initiativesRaw = useMemo(
    () => workspace?.initiatives ?? [],
    [workspace?.initiatives]
  );
  const initiatives = useMemo(() => excludePortfolioGhostRows(initiativesRaw), [initiativesRaw]);
  const countries = useMemo(
    () => workspace?.countries ?? [],
    [workspace?.countries]
  );
  const people = useMemo(
    () => workspace?.people ?? [],
    [workspace?.people]
  );
  const assignments = useMemo(
    () => workspace?.assignments ?? [],
    [workspace?.assignments]
  );
  const teamMetrics = useMemo(
    () => workspace?.teamMetrics ?? [],
    [workspace?.teamMetrics]
  );
  const readOnly = workspace?.readOnly ?? false;
  const geoSplitMutation = useLocationAllocationGeoSplitMutation();

  useEffect(() => {
    if (defaultUnitAppliedRef.current) return;
    defaultUnitAppliedRef.current = true;
    if (searchParams.has('unit') || searchParams.has('comment')) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('unit', unitToUrlParam(DEFAULT_ALLOCATION_UNIT));
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  const periodOptions = useMemo<LocationAllocationPeriodOption[]>(() => {
    const availableQuarters = [
      ...new Set(
        initiatives.flatMap((row) =>
          Object.keys(row.quarterlyData).filter((key) => /^\d{4}-Q[1-4]$/.test(key))
        )
      ),
    ].sort();
    const datasetQuarters = resolveLocationAllocationDatasetQuarters({
      availableQuarters,
      periodStart: workspace?.dataset.periodStart,
      periodEnd: workspace?.dataset.periodEnd,
      datasetLabel: workspace?.dataset.label,
    });
    return buildLocationAllocationPeriodOptions(datasetQuarters);
  }, [
    initiatives,
    workspace?.dataset.label,
    workspace?.dataset.periodEnd,
    workspace?.dataset.periodStart,
  ]);

  const requestedPeriod = searchParams.get('period') || '';
  const defaultPeriod =
    periodOptions.find((option) => option.value === String(CURRENT_YEAR))?.value ??
    periodOptions[0]?.value ??
    String(CURRENT_YEAR);
  const selectedPeriod = useMemo(() => {
    const requested = resolveLocationAllocationPeriod(requestedPeriod, periodOptions);
    if (requested) return requested;
    return (
      periodOptions.find((option) => option.value === String(CURRENT_YEAR)) ??
      periodOptions[0] ?? {
        value: String(CURRENT_YEAR),
        label: `${CURRENT_YEAR} · весь год`,
        year: CURRENT_YEAR,
        quarters: Array.from({ length: 4 }, (_, index) => `${CURRENT_YEAR}-Q${index + 1}`),
      }
    );
  }, [periodOptions, requestedPeriod]);

  const headcount = useMemo(() => buildLocationHeadcountIndex(people), [people]);

  const saveGeoCostSplit = useCallback(
    async (id: string, split: GeoCostSplit | undefined) => {
      if (readOnly) {
        throw new Error('Исторический набор доступен только для просмотра');
      }
      await geoSplitMutation.mutateAsync({ initiativeId: id, split });
    },
    [geoSplitMutation, readOnly]
  );

  const saveInitiativeTags = useCallback(
    async (_id: string, _tags: InitiativeTag[]) => {},
    []
  );

  const setRegionFilter = useCallback(
    (region: TopRegionLabel | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cluster');
        const slug = topRegionToUrlSlug(region);
        if (slug) next.set('region', slug);
        else next.delete('region');
        return next;
      });
    },
    [setSearchParams]
  );

  const setUnitFilter = useCallback(
    (unit: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (unit) next.set('unit', unitToUrlParam(unit));
        else next.delete('unit');
        next.delete('team');
        return next;
      });
    },
    [setSearchParams]
  );

  const setTeamFilter = useCallback(
    (team: string | null, unit?: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const unitToSet = unit ?? prev.get('unit');
        if (team && unitToSet) {
          next.set('unit', unitToSet);
          next.set('team', teamToUrlParam(team));
        } else {
          next.delete('team');
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const setMarketFilter = useCallback(
    (country: (typeof countries)[number] | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (country) next.set('market', country.id);
        else next.delete('market');
        return next;
      });
    },
    [setSearchParams]
  );

  const setPeriod = useCallback(
    (period: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('period', period);
        return next;
      });
    },
    [setSearchParams]
  );

  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('period');
      next.delete('region');
      next.delete('cluster');
      next.delete('unit');
      next.delete('team');
      next.delete('market');
      return next;
    });
  }, [setSearchParams]);

  const countryIdToClusterKey = useMemo(
    () => buildCountryIdToClusterMap(countries),
    [countries]
  );

  const marketCountry = useMemo(
    () => countries.find((c) => c.id === marketCountryId) ?? null,
    [countries, marketCountryId]
  );
  const handleViewChange = useCallback(
    (view: ViewType) => {
      if (view === 'allocations') return;
      navigate('/dashboard', { state: { dashboardView: view } });
    },
    [navigate]
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header
        currentView="allocations"
        onViewChange={handleViewChange}
        isAdmin={isAdmin}
        adminTo="/admin"
        showCrossInitiativesTab={hasEarlyAccess}
      />

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 pt-[72px] sm:p-6 sm:pt-[80px] pb-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Загрузка…
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
              Не удалось загрузить аллокации: {error instanceof Error ? error.message : 'попробуйте обновить страницу'}
            </div>
          ) : (
            <>
              {readOnly ? (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-100">
                  <p className="font-semibold">
                    Исторический набор «{workspace?.dataset.label}»
                  </p>
                  <p className="mt-0.5 text-xs text-amber-900/75 dark:text-amber-100/70">
                    Аллокации доступны только для просмотра. Редактирование и
                    комментарии остаются в текущем наборе данных.
                  </p>
                </div>
              ) : null}
              <LocationAllocationDrillDown
                initiatives={initiatives}
                countries={countries}
                countryIdToClusterKey={countryIdToClusterKey}
                year={selectedPeriod.year}
                period={selectedPeriod.value}
                defaultPeriod={defaultPeriod}
                periodLabel={selectedPeriod.label}
                periodOptions={periodOptions}
                selectedQuarters={selectedPeriod.quarters}
                onPeriodChange={setPeriod}
                onResetFilters={resetFilters}
                regionFilter={regionFilter}
                onRegionFilterChange={setRegionFilter}
                unitFilter={unitFilter}
                onUnitFilterChange={setUnitFilter}
                teamFilter={teamFilter}
                onTeamFilterChange={setTeamFilter}
                marketCountry={marketCountry}
                onMarketFilterChange={setMarketFilter}
                onGeoCostSplitSave={saveGeoCostSplit}
                onInitiativeTagsSave={saveInitiativeTags}
                people={people}
                assignments={assignments}
                headcount={headcount}
                teamMetrics={teamMetrics}
                readOnly={readOnly}
                focusedComment={readOnly ? null : focusedComment}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
