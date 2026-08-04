import {
  ALLOCATION_SCENARIO_AREA_ORDER,
  type AllocationScenarioArea,
} from '@/lib/allocationScenarioAreas';

export type UnitAllocationKind = AllocationScenarioArea | 'RUN';

export type UnitAllocationSummaryItem = {
  kind: UnitAllocationKind;
  amountRub: number;
  percent: number;
};

type UnitAllocationTeam = {
  fot2026Rub: number;
  regions: Array<{
    region: AllocationScenarioArea;
    percent: number;
  }>;
};

export function calculateUnitAllocationSummary({
  teams,
  officialCostRub,
}: {
  teams: UnitAllocationTeam[];
  officialCostRub: number;
}): UnitAllocationSummaryItem[] {
  const marketAmounts = new Map<AllocationScenarioArea, number>(
    ALLOCATION_SCENARIO_AREA_ORDER.map((area) => [area, 0])
  );

  for (const team of teams) {
    for (const region of team.regions) {
      marketAmounts.set(
        region.region,
        (marketAmounts.get(region.region) ?? 0) +
          team.fot2026Rub * (region.percent / 100)
      );
    }
  }

  const allocatedToMarketsRub = [...marketAmounts.values()].reduce(
    (sum, amountRub) => sum + amountRub,
    0
  );
  const runAmountRub = officialCostRub - allocatedToMarketsRub;
  const toPercent = (amountRub: number) =>
    officialCostRub > 0 ? (amountRub / officialCostRub) * 100 : 0;

  return [
    ...ALLOCATION_SCENARIO_AREA_ORDER.map((kind) => {
      const amountRub = marketAmounts.get(kind) ?? 0;
      return { kind, amountRub, percent: toPercent(amountRub) };
    }),
    {
      kind: 'RUN' as const,
      amountRub: runAmountRub,
      percent: toPercent(runAmountRub),
    },
  ];
}
