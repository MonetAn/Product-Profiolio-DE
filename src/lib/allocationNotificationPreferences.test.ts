import { describe, expect, it } from 'vitest';
import {
  buildAllocationNotificationScopeOptions,
  normalizeAllocationNotificationPreferences,
} from '@/lib/allocationNotificationPreferences';

describe('allocation notification preferences', () => {
  it('builds unique sorted units and teams from initiative rows', () => {
    expect(
      buildAllocationNotificationScopeOptions([
        { unit: 'Data Office', team: 'Core Data' },
        { unit: 'App&Web', team: 'Site' },
        { unit: 'Data Office', team: 'Analytics' },
        { unit: 'Data Office', team: 'Core Data' },
        { unit: '', team: 'Ignored' },
      ])
    ).toEqual([
      { unit: 'App&Web', teams: ['Site'] },
      { unit: 'Data Office', teams: ['Analytics', 'Core Data'] },
    ]);
  });

  it('defaults a missing preference row to all scopes', () => {
    expect(normalizeAllocationNotificationPreferences(null)).toEqual({
      allScopes: true,
      selectedUnits: [],
      selectedTeamPairs: [],
    });
  });

  it('deduplicates custom scopes and removes redundant team pairs', () => {
    expect(
      normalizeAllocationNotificationPreferences({
        all_scopes: false,
        selected_units: ['Data Office', 'Data Office'],
        selected_team_pairs: [
          { unit: 'Data Office', team: 'Core Data' },
          { unit: 'App&Web', team: 'Site' },
          { unit: 'App&Web', team: 'Site' },
          { unit: '', team: 'Ignored' },
        ],
      })
    ).toEqual({
      allScopes: false,
      selectedUnits: ['Data Office'],
      selectedTeamPairs: [{ unit: 'App&Web', team: 'Site' }],
    });
  });
});
