import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_SCENARIO_AREA_LABELS,
  ALLOCATION_SCENARIO_AREA_ORDER,
} from './allocationScenarioAreas';

describe('allocation scenario areas', () => {
  it('keeps Platform separate from the three geographic regions', () => {
    expect(ALLOCATION_SCENARIO_AREA_ORDER).toEqual([
      'Domestic Region',
      'International Region',
      'Drink It',
      'Platform',
    ]);
    expect(ALLOCATION_SCENARIO_AREA_LABELS.Platform).toBe('Platform');
  });
});
