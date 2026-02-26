import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

export function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedUnits = useMemo(() => {
    const units = searchParams.get('units');
    return units ? units.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const selectedTeams = useMemo(() => {
    const teams = searchParams.get('teams');
    return teams ? teams.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const setSelectedUnits = useCallback((units: string[]) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (units.length > 0) {
        newParams.set('units', units.join(','));
      } else {
        newParams.delete('units');
      }
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setSelectedTeams = useCallback((teams: string[]) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (teams.length > 0) {
        newParams.set('teams', teams.join(','));
      } else {
        newParams.delete('teams');
      }
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilters = useCallback((units: string[], teams: string[]) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      
      if (units.length > 0) {
        newParams.set('units', units.join(','));
      } else {
        newParams.delete('units');
      }
      
      if (teams.length > 0) {
        newParams.set('teams', teams.join(','));
      } else {
        newParams.delete('teams');
      }
      
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Build URL with current filters for navigation
  const buildFilteredUrl = useCallback((basePath: string) => {
    const params = new URLSearchParams();
    if (selectedUnits.length > 0) {
      params.set('units', selectedUnits.join(','));
    }
    if (selectedTeams.length > 0) {
      params.set('teams', selectedTeams.join(','));
    }
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  }, [selectedUnits, selectedTeams]);

  return {
    selectedUnits,
    selectedTeams,
    setSelectedUnits,
    setSelectedTeams,
    setFilters,
    buildFilteredUrl
  };
}
