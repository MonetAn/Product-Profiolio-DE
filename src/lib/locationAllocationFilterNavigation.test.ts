import { describe, expect, it } from 'vitest';
import {
  locationAllocationFilterFocusPath,
  locationAllocationParentFocusPath,
} from '@/lib/locationAllocationFilterNavigation';

describe('location allocation filter navigation', () => {
  it('builds a focused path for the selected organization level', () => {
    expect(locationAllocationFilterFocusPath('Unit A', null)).toEqual(['Unit A']);
    expect(
      locationAllocationFilterFocusPath('Unit A', {
        unit: 'Unit A',
        team: 'Team B',
      })
    ).toEqual(['Unit A', 'Team B']);
  });

  it('uses the visible placeholder for an empty team', () => {
    expect(
      locationAllocationFilterFocusPath('Unit A', {
        unit: 'Unit A',
        team: '',
      })
    ).toEqual(['Unit A', 'Без команды']);
  });

  it('moves up exactly one organization level', () => {
    expect(
      locationAllocationParentFocusPath(['Unit A', 'Team B'])
    ).toEqual(['Unit A']);
    expect(locationAllocationParentFocusPath(['Unit A'])).toEqual([]);
    expect(locationAllocationParentFocusPath([])).toEqual([]);
  });
});
