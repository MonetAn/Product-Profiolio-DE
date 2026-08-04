import { describe, expect, it } from 'vitest';
import { calculateUnitAllocationSummary } from './locationAllocationUnitSummary';

describe('calculateUnitAllocationSummary', () => {
  it('includes hidden management and every other remainder in RUN', () => {
    const result = calculateUnitAllocationSummary({
      officialCostRub: 150_000_000,
      teams: [
        {
          fot2026Rub: 100_000_000,
          regions: [
            { region: 'Domestic Region', percent: 50 },
            { region: 'International Region', percent: 10 },
            { region: 'Drink It', percent: 5 },
            { region: 'Platform', percent: 15 },
          ],
        },
      ],
    });

    expect(
      result.map(({ kind, amountRub }) => ({ kind, amountRub }))
    ).toEqual([
      { kind: 'Domestic Region', amountRub: 50_000_000 },
      { kind: 'International Region', amountRub: 10_000_000 },
      { kind: 'Drink It', amountRub: 5_000_000 },
      { kind: 'Platform', amountRub: 15_000_000 },
      { kind: 'RUN', amountRub: 70_000_000 },
    ]);
    expect(result.reduce((sum, item) => sum + item.amountRub, 0)).toBe(
      150_000_000
    );
    expect(result.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100);
  });

  it('assigns unallocated team costs to RUN', () => {
    const result = calculateUnitAllocationSummary({
      officialCostRub: 65_000_000,
      teams: [
        {
          fot2026Rub: 13_000_000,
          regions: [
            { region: 'Domestic Region', percent: 90 },
            { region: 'Platform', percent: 10 },
          ],
        },
        { fot2026Rub: 53_000_000, regions: [] },
      ],
    });

    expect(result.find((item) => item.kind === 'RUN')?.amountRub).toBe(
      52_000_000
    );
  });
});
