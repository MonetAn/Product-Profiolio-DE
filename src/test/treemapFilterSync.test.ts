import { describe, expect, it } from 'vitest';
import {
  filtersToBudgetTreemapPath,
  filtersToStakeholdersTreemapPath,
  teamFromPathSegment,
  teamToPathSegment,
  treemapPathToBudgetFilters,
  treemapPathToStakeholdersFilters,
} from '@/lib/treemapFilterSync';

describe('treemapFilterSync', () => {
  it('round-trips budget path with empty team', () => {
    const path = ['Unit A', 'Без команды'];
    expect(treemapPathToBudgetFilters(path)).toEqual({ units: ['Unit A'], teams: [''] });
    expect(filtersToBudgetTreemapPath(['Unit A'], [''])).toEqual(path);
  });

  it('round-trips stakeholders path', () => {
    const path = ['Cluster X', 'Unit A', 'Team B'];
    expect(treemapPathToStakeholdersFilters(path)).toEqual({
      stakeholders: ['Cluster X'],
      units: ['Unit A'],
      teams: ['Team B'],
    });
    expect(
      filtersToStakeholdersTreemapPath(['Cluster X'], ['Unit A'], ['Team B'])
    ).toEqual(path);
  });

  it('maps empty path to empty filters', () => {
    expect(treemapPathToBudgetFilters([])).toEqual({ units: [], teams: [] });
    expect(treemapPathToStakeholdersFilters([])).toEqual({
      stakeholders: [],
      units: [],
      teams: [],
    });
  });

  it('normalizes team path segments', () => {
    expect(teamFromPathSegment('Без команды')).toBe('');
    expect(teamToPathSegment('')).toBe('Без команды');
    expect(teamToPathSegment('Dev')).toBe('Dev');
  });
});
