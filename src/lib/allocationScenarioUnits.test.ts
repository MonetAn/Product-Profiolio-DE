import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_SCENARIO_UNITS,
  DEFAULT_ALLOCATION_SCENARIO_UNIT,
  normalizeAllocationScenarioUnit,
  normalizeAllocationScenarioUnits,
  resolveAllocationScenarioUnit,
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

  it('defaults an empty or unsupported filter to Data Office + AI Hub', () => {
    expect(DEFAULT_ALLOCATION_SCENARIO_UNIT).toBe('Data Office + AI Hub');
    expect(resolveAllocationScenarioUnit(null)).toBe(
      'Data Office + AI Hub'
    );
    expect(resolveAllocationScenarioUnit('FAP')).toBe(
      'Data Office + AI Hub'
    );
    expect(resolveAllocationScenarioUnit('App&Web')).toBe('App&Web');
  });
});
