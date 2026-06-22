import { describe, expect, it } from 'vitest';
import type { AdminQuarterData } from './adminDataManager';
import { appendCostHistory, appendRevenueRubHistory } from './quarterValueHistory';

const emptyQ = (): AdminQuarterData => ({
  cost: 0,
  otherCosts: 0,
  support: false,
  onTrack: true,
  metricPlan: '',
  metricFact: '',
  comment: '',
  effortCoefficient: 0,
});

describe('appendCostHistory', () => {
  it('appends when budget total changes', () => {
    const prev = { ...emptyQ(), cost: 1_000_000 };
    const history = appendCostHistory(prev, 1_300_000, 0, '2026-Q1');
    expect(history).toHaveLength(1);
    expect(history?.[0]).toMatchObject({ total: 1_300_000, setInQuarter: '2026-Q1' });
  });

  it('does not append duplicate total', () => {
    const prev = {
      ...emptyQ(),
      cost: 1_000_000,
      costHistory: [
        { cost: 1_000_000, otherCosts: 0, total: 1_000_000, at: '2026-01-01', setInQuarter: '2026-Q1' },
      ],
    };
    const history = appendCostHistory(prev, 1_000_000, 0, '2026-Q2');
    expect(history).toHaveLength(1);
  });
});

describe('appendRevenueRubHistory', () => {
  it('appends when profit changes', () => {
    const history = appendRevenueRubHistory(emptyQ(), 2_000_000, '2026-Q1');
    expect(history?.[0]?.value).toBe(2_000_000);
  });
});
