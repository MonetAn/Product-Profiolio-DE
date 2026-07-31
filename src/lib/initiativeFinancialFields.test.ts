import { describe, expect, it } from 'vitest';
import {
  parseAdminQuarterFromJson,
  quarterlyDataToJson,
} from '@/hooks/useInitiatives';

describe('initiative quarterly financial fields', () => {
  it('reads legacy revenueRub as profit for backward compatibility', () => {
    const legacyHistory = [
      {
        value: 2_000_000,
        at: '2026-04-15T10:00:00.000Z',
        setInQuarter: '2026-Q2',
      },
    ];

    const parsed = parseAdminQuarterFromJson('2026-Q2', {
      cost: 0,
      revenueRub: 2_000_000,
      revenueRubHistory: legacyHistory,
    });

    expect(parsed).toMatchObject({
      cost: 0,
      profitRub: 2_000_000,
      profitRubHistory: legacyHistory,
    });
    expect(parsed?.grossRevenueRub).toBeUndefined();
  });

  it('keeps profit and gross revenue as separate canonical fields on save', () => {
    const serialized = quarterlyDataToJson({
      '2026-Q3': {
        cost: 0,
        otherCosts: 0,
        support: false,
        onTrack: true,
        metricPlan: '',
        metricFact: '',
        comment: '',
        effortCoefficient: 0,
        profitRub: 1_500_000,
        grossRevenueRub: 5_000_000,
      },
    }) as Record<string, Record<string, unknown>>;

    expect(serialized['2026-Q3']).toMatchObject({
      profitRub: 1_500_000,
      grossRevenueRub: 5_000_000,
    });
    expect(serialized['2026-Q3']).not.toHaveProperty('revenueRub');
  });
});
