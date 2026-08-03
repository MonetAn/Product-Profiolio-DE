import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_SCENARIO_UNITS,
  DEFAULT_ALLOCATION_SCENARIO_UNIT,
  normalizeAllocationScenarioUnit,
  normalizeAllocationScenarioUnits,
  resolveAllocationScenarioUnit,
} from './allocationScenarioUnits';

describe('allocation scenario units', () => {
  it('keeps only the six presentation units', () => {
    expect(
      normalizeAllocationScenarioUnits([
        'Tech Platform',
        'FAP',
        'App&Web',
        'Client Platform',
        'B2B Pizza',
        'AI Hub',
      ])
    ).toEqual([
      'App&Web',
      'B2B Pizza',
      'Client Platform',
      'AI Hub',
      'Tech Platform',
    ]);
    expect(ALLOCATION_SCENARIO_UNITS).toHaveLength(6);
  });

  it('renames the legacy combined unit to Data Office', () => {
    expect(normalizeAllocationScenarioUnit('Data Office + AI Hub')).toBe(
      'Data Office'
    );
    expect(
      normalizeAllocationScenarioUnits([
        'Data Office',
        'Data Office + AI Hub',
      ])
    ).toEqual(['Data Office']);
  });

  it('defaults an empty or unsupported filter to Data Office', () => {
    expect(DEFAULT_ALLOCATION_SCENARIO_UNIT).toBe('Data Office');
    expect(resolveAllocationScenarioUnit(null)).toBe('Data Office');
    expect(resolveAllocationScenarioUnit('FAP')).toBe('Data Office');
    expect(resolveAllocationScenarioUnit('App&Web')).toBe('App&Web');
  });
});
