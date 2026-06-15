import { describe, expect, it } from 'vitest';
import { computeInitiativePayback, formatPaybackRatio } from './initiativePayback';

describe('computeInitiativePayback', () => {
  it('returns null when no revenue quarters in period', () => {
    expect(
      computeInitiativePayback(
        { '2026-Q1': { budget: 1_000_000 } },
        ['2026-Q1']
      )
    ).toBeNull();
  });

  it('sums only quarters with revenue and matching cost', () => {
    const summary = computeInitiativePayback(
      {
        '2026-Q1': { budget: 1_000_000 },
        '2026-Q2': { budget: 500_000, revenueRub: 2_000_000 },
        '2026-Q3': { budget: 300_000, revenueRub: 400_000 },
      },
      ['2026-Q1', '2026-Q2', '2026-Q3']
    );
    expect(summary).toMatchObject({
      periodRevenue: 2_400_000,
      periodCost: 800_000,
      ratio: 3,
      isPaidOff: true,
      revenueQuarters: ['2026-Q2', '2026-Q3'],
    });
  });

  it('marks not paid off when revenue < cost', () => {
    const summary = computeInitiativePayback(
      { '2026-Q2': { budget: 2_000_000, revenueRub: 1_000_000 } },
      ['2026-Q2']
    );
    expect(summary?.isPaidOff).toBe(false);
    expect(summary?.ratio).toBe(0.5);
  });
});

describe('formatPaybackRatio', () => {
  it('formats compact multiplier', () => {
    expect(formatPaybackRatio(1.666)).toBe('×1.67');
    expect(formatPaybackRatio(12.34)).toBe('×12.3');
  });
});
