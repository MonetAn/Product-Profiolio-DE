import { describe, expect, it } from 'vitest';
import {
  resolveLocationAllocationPeriod,
  type LocationAllocationPeriodOption,
} from '@/lib/locationAllocationPeriod';

const options: LocationAllocationPeriodOption[] = [
  {
    value: '2026',
    label: '2026 · весь год',
    year: 2026,
    quarters: ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'],
  },
  ...['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'].map((quarter) => ({
    value: quarter,
    label: quarter,
    year: 2026,
    quarters: [quarter],
  })),
];

describe('resolveLocationAllocationPeriod', () => {
  it('returns a predefined period', () => {
    expect(resolveLocationAllocationPeriod('2026', options)?.quarters).toHaveLength(4);
  });

  it('builds an inclusive range and normalizes reverse selection', () => {
    expect(
      resolveLocationAllocationPeriod('2026-Q3..2026-Q1', options)
    ).toMatchObject({
      value: '2026-Q1..2026-Q3',
      label: '2026 · Q1–Q3',
      quarters: ['2026-Q1', '2026-Q2', '2026-Q3'],
    });
  });

  it('rejects a range across different years', () => {
    expect(
      resolveLocationAllocationPeriod('2025-Q4..2026-Q1', options)
    ).toBeNull();
  });
});
