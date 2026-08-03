import { describe, expect, it } from 'vitest';
import {
  canManageAllocationScenarioTeams,
} from './allocationScenarioPermissions';

describe('canManageAllocationScenarioTeams', () => {
  it('shows structural team actions to every app user', () => {
    expect(canManageAllocationScenarioTeams()).toBe(true);
  });
});
