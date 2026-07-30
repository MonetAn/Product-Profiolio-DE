export const ALLOCATION_SCENARIO_AREA_ORDER = [
  'Domestic Region',
  'International Region',
  'Drink It',
  'Platform',
] as const;

export type AllocationScenarioArea =
  (typeof ALLOCATION_SCENARIO_AREA_ORDER)[number];

export const ALLOCATION_SCENARIO_AREA_LABELS: Record<
  AllocationScenarioArea,
  string
> = {
  'Domestic Region': 'Domestic',
  'International Region': 'International',
  'Drink It': 'Drinkit',
  Platform: 'Platform',
};
