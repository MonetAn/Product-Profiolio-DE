export const ALLOCATION_SCENARIO_UNITS = [
  'App&Web',
  'B2B Pizza',
  'Client Platform',
  'Data Office + AI Hub',
  'Tech Platform',
] as const;

export type AllocationScenarioUnit =
  (typeof ALLOCATION_SCENARIO_UNITS)[number];

const ALLOCATION_SCENARIO_UNIT_SET = new Set<string>(
  ALLOCATION_SCENARIO_UNITS
);

export function normalizeAllocationScenarioUnit(
  value: string | null | undefined
): AllocationScenarioUnit | null {
  const unit = value?.trim() ?? '';
  if (unit === 'Data Office') return 'Data Office + AI Hub';
  return ALLOCATION_SCENARIO_UNIT_SET.has(unit)
    ? (unit as AllocationScenarioUnit)
    : null;
}

export function normalizeAllocationScenarioUnits(
  values: readonly string[] | null | undefined
): AllocationScenarioUnit[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => normalizeAllocationScenarioUnit(value))
        .filter((value): value is AllocationScenarioUnit => Boolean(value))
    ),
  ].sort(
    (left, right) =>
      ALLOCATION_SCENARIO_UNITS.indexOf(left) -
      ALLOCATION_SCENARIO_UNITS.indexOf(right)
  );
}
