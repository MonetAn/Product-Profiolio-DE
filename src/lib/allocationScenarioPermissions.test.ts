import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL,
  canManageAllocationScenarioTeams,
} from './allocationScenarioPermissions';

describe('canManageAllocationScenarioTeams', () => {
  it('allows structural team actions only for the configured manager', () => {
    expect(
      canManageAllocationScenarioTeams(ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL)
    ).toBe(true);
    expect(
      canManageAllocationScenarioTeams(
        `  ${ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL.toUpperCase()}  `
      )
    ).toBe(true);
    expect(canManageAllocationScenarioTeams('other@dodobrands.io')).toBe(false);
    expect(canManageAllocationScenarioTeams(null)).toBe(false);
  });
});
