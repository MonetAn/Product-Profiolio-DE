import { useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AdminHeader from '@/components/admin/AdminHeader';
import { LocationAllocationDrillDown } from '@/components/admin/location-allocation/LocationAllocationDrillDown';
import { useInitiatives } from '@/hooks/useInitiatives';
import { useInitiativeMutations } from '@/hooks/useInitiativeMutations';
import { useMarketCountries, buildCountryIdToClusterMap } from '@/hooks/useMarketCountries';
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

const CURRENT_YEAR = new Date().getFullYear();

export default function AdminLocationAllocations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const regionFilter = topRegionFromUrlSlug(searchParams.get('region') || '');
  const unitFilter = unitFromUrlParam(searchParams.get('unit') || '');
  const teamFilter = teamFromUrlParam(searchParams.get('team') || '');
  const marketCountryId = searchParams.get('market') || '';

  const { data: initiativesRaw = [], isLoading: loadingInitiatives } = useInitiatives({ tableAll: true });
  const initiatives = useMemo(() => excludePortfolioGhostRows(initiativesRaw), [initiativesRaw]);
  const { data: countries = [], isLoading: loadingCountries } = useMarketCountries();
  const { updateInitiativeFieldAsync } = useInitiativeMutations();

  const saveGeoCostSplit = useCallback(
    async (id: string, split: GeoCostSplit | undefined) => {
      await updateInitiativeFieldAsync(id, 'initiativeGeoCostSplit', split);
    },
    [updateInitiativeFieldAsync]
  );

  const setRegionFilter = useCallback(
    (region: TopRegionLabel | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cluster');
        next.delete('unit');
        next.delete('team');
        next.delete('market');
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

  const countryIdToClusterKey = useMemo(
    () => buildCountryIdToClusterMap(countries),
    [countries]
  );

  const marketCountry = useMemo(
    () => countries.find((c) => c.id === marketCountryId) ?? null,
    [countries, marketCountryId]
  );
  const isLoading = loadingInitiatives || loadingCountries;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AdminHeader currentView="locationAllocations" />

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-6 pb-10">
        <div className="mx-auto w-full max-w-[1200px] space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Загрузка…
            </div>
          ) : (
            <LocationAllocationDrillDown
              initiatives={initiatives}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              year={CURRENT_YEAR}
              regionFilter={regionFilter}
              onRegionFilterChange={setRegionFilter}
              unitFilter={unitFilter}
              onUnitFilterChange={setUnitFilter}
              teamFilter={teamFilter}
              onTeamFilterChange={setTeamFilter}
              marketCountry={marketCountry}
              onMarketFilterChange={setMarketFilter}
              onGeoCostSplitSave={saveGeoCostSplit}
            />
          )}
        </div>
      </main>
    </div>
  );
}
