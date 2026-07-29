import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_SCENARIO_UNITS,
  normalizeAllocationScenarioUnit,
  normalizeAllocationScenarioUnits,
} from './allocationScenarioUnits';

describe('allocation scenario units', () => {
  it('keeps only the five presentation units', () => {
    expect(
      normalizeAllocationScenarioUnits([
        'Tech Platform',
        'FAP',
        'App&Web',
        'Client Platform',
        'B2B Pizza',
      ])
    ).toEqual([
      'App&Web',
      'B2B Pizza',
      'Client Platform',
      'Tech Platform',
    ]);
    expect(ALLOCATION_SCENARIO_UNITS).toHaveLength(5);
  });

  it('renames the legacy Data Office unit', () => {
    expect(normalizeAllocationScenarioUnit('Data Office')).toBe(
      'Data Office + AI Hub'
    );
    expect(
      normalizeAllocationScenarioUnits([
        'Data Office',
        'Data Office + AI Hub',
      ])
    ).toEqual(['Data Office + AI Hub']);
  });
});
