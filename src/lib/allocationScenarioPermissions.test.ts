import { describe, expect, it } from 'vitest';
import {
  canManageAllocationScenarioTeams,
} from './allocationScenarioPermissions';

describe('canManageAllocationScenarioTeams', () => {
  it('allows structural team actions only for Anton Monetov', () => {
    expect(
      canManageAllocationScenarioTeams('a.monetov@dodobrands.io')
    ).toBe(true);
    expect(
      canManageAllocationScenarioTeams(' A.MONETOV@DODOBRANDS.IO ')
    ).toBe(true);
  });

  it('hides structural team actions from every other user', () => {
    expect(
      canManageAllocationScenarioTeams('colleague@dodobrands.io')
    ).toBe(false);
    expect(canManageAllocationScenarioTeams(null)).toBe(false);
  });
});
