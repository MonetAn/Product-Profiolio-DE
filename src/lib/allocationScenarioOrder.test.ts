import { describe, expect, it } from 'vitest';
import { reorderAllocationScenarioTeamIds } from './allocationScenarioOrder';

describe('reorderAllocationScenarioTeamIds', () => {
  it('moves a team before the selected target', () => {
    expect(
      reorderAllocationScenarioTeamIds({
        teamIds: ['a', 'b', 'c', 'd'],
        draggedTeamId: 'd',
        targetTeamId: 'b',
        position: 'before',
      })
    ).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a team after the selected target', () => {
    expect(
      reorderAllocationScenarioTeamIds({
        teamIds: ['a', 'b', 'c', 'd'],
        draggedTeamId: 'a',
        targetTeamId: 'c',
        position: 'after',
      })
    ).toEqual(['b', 'c', 'a', 'd']);
  });
});
