import { describe, expect, it } from 'vitest';
import { rowPassesTimelineFilters, type RawDataRow } from '@/lib/dataManager';

const baseRow = (overrides: Partial<RawDataRow> = {}): RawDataRow =>
  ({
    unit: 'Unit A',
    team: 'Team 1',
    initiative: 'Initiative X',
    stakeholders: 'Alice',
    quarterlyData: { '2026-Q1': { budget: 100 } },
    isTimelineStub: false,
    ...overrides,
  }) as RawDataRow;

const baseOptions = {
  selectedQuarters: ['2026-Q1'],
  supportFilter: 'all' as const,
  showOnlyOfftrack: false,
  hideStubs: false,
  selectedUnits: [] as string[],
  selectedTeams: [] as string[],
  selectedStakeholders: [] as string[],
};

describe('rowPassesTimelineFilters', () => {
  it('passes when no filters are active', () => {
    expect(rowPassesTimelineFilters(baseRow(), baseOptions)).toBe(true);
  });

  it('fails when unit filter excludes the row', () => {
    expect(
      rowPassesTimelineFilters(baseRow(), {
        ...baseOptions,
        selectedUnits: ['Other Unit'],
      })
    ).toBe(false);
  });

  it('fails when team filter excludes the row', () => {
    expect(
      rowPassesTimelineFilters(baseRow(), {
        ...baseOptions,
        selectedTeams: ['Other Team'],
      })
    ).toBe(false);
  });

  it('fails for timeline stub with negligible rounding budget and no effort', () => {
    expect(
      rowPassesTimelineFilters(
        baseRow({
          isTimelineStub: true,
          quarterlyData: { '2026-Q1': { budget: 1 } },
        }),
        baseOptions
      )
    ).toBe(false);
  });

  it('passes for timeline stub with meaningful budget', () => {
    expect(
      rowPassesTimelineFilters(
        baseRow({
          isTimelineStub: true,
          quarterlyData: { '2026-Q1': { budget: 5000 } },
        }),
        baseOptions
      )
    ).toBe(true);
  });

  it('fails when only effort is set for the period (no visible budget)', () => {
    expect(
      rowPassesTimelineFilters(
        baseRow({
          quarterlyData: {
            '2026-Q1': { budget: 0, effortCoefficient: 25 },
          },
        }),
        baseOptions
      )
    ).toBe(false);
  });

  it('passes off-track filter when any selected quarter is off-track', () => {
    expect(
      rowPassesTimelineFilters(
        baseRow({
          quarterlyData: {
            '2026-Q1': { budget: 100, onTrack: false },
            '2026-Q2': { budget: 100, onTrack: true },
          },
        }),
        {
          ...baseOptions,
          selectedQuarters: ['2026-Q1', '2026-Q2'],
          showOnlyOfftrack: true,
        }
      )
    ).toBe(true);
  });
});
