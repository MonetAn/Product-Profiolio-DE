import { describe, expect, it } from 'vitest';
import {
  buildLocationAllocationPeriodOptions,
  formatLocationAllocationQuarterSpan,
  resolveLocationAllocationDatasetQuarters,
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

  it('uses dataset dates to limit a partial year to Q1–Q2', () => {
    expect(
      resolveLocationAllocationDatasetQuarters({
        availableQuarters: [
          '2026-Q1',
          '2026-Q2',
          '2026-Q3',
          '2026-Q4',
        ],
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
        datasetLabel: 'Факт Q1–Q2 2026',
      })
    ).toEqual(['2026-Q1', '2026-Q2']);
  });

  it('falls back to a Q1–Q2 range from the dataset label', () => {
    expect(
      resolveLocationAllocationDatasetQuarters({
        availableQuarters: [
          '2026-Q1',
          '2026-Q2',
          '2026-Q3',
          '2026-Q4',
        ],
        datasetLabel: 'Факт Q1–Q2 2026',
      })
    ).toEqual(['2026-Q1', '2026-Q2']);
  });

  it('labels an incomplete year with quarters and a complete year as the whole year', () => {
    expect(
      buildLocationAllocationPeriodOptions(['2026-Q1', '2026-Q2'])[0]
    ).toMatchObject({
      value: '2026',
      label: '2026 · Q1–Q2',
      quarters: ['2026-Q1', '2026-Q2'],
    });
    expect(
      buildLocationAllocationPeriodOptions([
        '2026-Q1',
        '2026-Q2',
        '2026-Q3',
        '2026-Q4',
      ])[0].label
    ).toBe('2026 · весь год');
    expect(formatLocationAllocationQuarterSpan(['2026-Q1'])).toBe('Q1');
  });
});
