import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

function decodeTeamFromUrl(team: string): string {
  return team === 'Без команды' ? '' : team;
}

function encodeTeamForUrl(team: string): string {
  return team === '' ? 'Без команды' : team;
}

export interface ScopeFilters {
  units: string[];
  teams: string[];
  stakeholders: string[];
}

export function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedUnits = useMemo(() => {
    const units = searchParams.get('units');
    return units ? units.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const selectedTeams = useMemo(() => {
    const teams = searchParams.get('teams');
    return teams ? teams.split(',').map(decodeTeamFromUrl) : [];
  }, [searchParams]);

  const selectedStakeholders = useMemo(() => {
    const stakeholders = searchParams.get('stakeholders');
    return stakeholders ? stakeholders.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const setSelectedUnits = useCallback((units: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (units.length > 0) {
      newParams.set('units', units.join(','));
    } else {
      newParams.delete('units');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setSelectedTeams = useCallback((teams: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (teams.length > 0) {
      newParams.set('teams', teams.map(encodeTeamForUrl).join(','));
    } else {
      newParams.delete('teams');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setSelectedStakeholders = useCallback((stakeholders: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (stakeholders.length > 0) {
      newParams.set('stakeholders', stakeholders.join(','));
    } else {
      newParams.delete('stakeholders');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setFilters = useCallback((units: string[], teams: string[]) => {
    const newParams = new URLSearchParams(searchParams);

    if (units.length > 0) {
      newParams.set('units', units.join(','));
    } else {
      newParams.delete('units');
    }

    if (teams.length > 0) {
      newParams.set('teams', teams.map(encodeTeamForUrl).join(','));
    } else {
      newParams.delete('teams');
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setScopeFilters = useCallback((scope: Partial<ScopeFilters>) => {
    const newParams = new URLSearchParams(searchParams);

    if (scope.units !== undefined) {
      if (scope.units.length > 0) {
        newParams.set('units', scope.units.join(','));
      } else {
        newParams.delete('units');
      }
    }

    if (scope.teams !== undefined) {
      if (scope.teams.length > 0) {
        newParams.set('teams', scope.teams.map(encodeTeamForUrl).join(','));
      } else {
        newParams.delete('teams');
      }
    }

    if (scope.stakeholders !== undefined) {
      if (scope.stakeholders.length > 0) {
        newParams.set('stakeholders', scope.stakeholders.join(','));
      } else {
        newParams.delete('stakeholders');
      }
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const buildFilteredUrl = useCallback((basePath: string) => {
    const params = new URLSearchParams();
    if (selectedUnits.length > 0) {
      params.set('units', selectedUnits.join(','));
    }
    if (selectedTeams.length > 0) {
      params.set('teams', selectedTeams.map(encodeTeamForUrl).join(','));
    }
    if (selectedStakeholders.length > 0) {
      params.set('stakeholders', selectedStakeholders.join(','));
    }
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  }, [selectedUnits, selectedTeams, selectedStakeholders]);

  return {
    selectedUnits,
    selectedTeams,
    selectedStakeholders,
    setSelectedUnits,
    setSelectedTeams,
    setSelectedStakeholders,
    setFilters,
    setScopeFilters,
    buildFilteredUrl,
  };
}
