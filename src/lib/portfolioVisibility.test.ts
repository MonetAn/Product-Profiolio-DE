import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { createEmptyQuarterData } from '@/lib/adminDataManager';
import { HUB_LOCAL_ROW_PREFIX } from '@/lib/portfolioHubDraft';
import {
  buildCoefficientMatrixPrimaryRows,
  countPortfolioFillInitiatives,
  excludePortfolioGhostRows,
  hasInitiativeSignalInQuarters,
  partitionCoefficientMatrixRows,
  resolvePortfolioMatrixTier,
} from '@/lib/portfolioVisibility';

function row(partial: Partial<AdminDataRow> & Pick<AdminDataRow, 'id'>): AdminDataRow {
  return {
    unit: 'Tech Platform',
    team: 'Architecture',
    initiative: 'Test',
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData: {},
    ...partial,
  };
}

const INTERVAL = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

describe('portfolioVisibility', () => {
  it('does not hide rows via legacy ghost flag (ghost only in app, not DB)', () => {
    const legacy = row({ id: 'g1', isPortfolioGhost: true });
    expect(resolvePortfolioMatrixTier(legacy)).toBe('inactive');
    expect(excludePortfolioGhostRows([legacy])).toHaveLength(1);
  });

  it('keeps hub-local rows as drafts', () => {
    const draft = row({ id: `${HUB_LOCAL_ROW_PREFIX}x`, isNew: true });
    expect(resolvePortfolioMatrixTier(draft)).toBe('draft');
  });

  it('completed with effort in interval stays in completed_current', () => {
    const completed = row({
      id: 'c1',
      isPortfolioCompleted: true,
      quarterlyData: {
        '2026-Q1': { ...createEmptyQuarterData(), effortCoefficient: 10 },
      },
    });
    expect(resolvePortfolioMatrixTier(completed, { intervalQuarters: INTERVAL })).toBe(
      'completed_current'
    );
  });

  it('completed without effort in interval goes to completed_past', () => {
    const completed = row({
      id: 'p1',
      isPortfolioCompleted: true,
      quarterlyData: {
        '2025-Q4': { ...createEmptyQuarterData(), effortCoefficient: 50 },
      },
    });
    expect(resolvePortfolioMatrixTier(completed, { intervalQuarters: INTERVAL })).toBe(
      'completed_past'
    );
  });

  it('inactive is only for saved 0% non-completed', () => {
    const inactive = row({ id: 'i1', isPortfolioCompleted: false });
    expect(resolvePortfolioMatrixTier(inactive)).toBe('inactive');
  });

  it('partitions matrix with completed sections', () => {
    const partition = partitionCoefficientMatrixRows(
      [
        row({ id: 'i1', initiative: 'B' }),
        row({ id: 'd1', isNew: true, initiative: 'Draft' }),
        row({
          id: 'a1',
          initiative: 'A',
          quarterlyData: { '2026-Q2': { ...createEmptyQuarterData(), effortCoefficient: 1 } },
        }),
        row({
          id: 'cc1',
          initiative: 'Done now',
          isPortfolioCompleted: true,
          quarterlyData: { '2026-Q1': { ...createEmptyQuarterData(), effortCoefficient: 5 } },
        }),
        row({
          id: 'cp1',
          initiative: 'Done past',
          isPortfolioCompleted: true,
          quarterlyData: {},
        }),
        row({ id: 'stub', isTimelineStub: true, initiative: 'stub' }),
        row({ id: 'g1', isPortfolioGhost: true }),
      ],
      { intervalQuarters: INTERVAL }
    );
    expect(partition.inactive.map((r) => r.id)).toEqual(['i1', 'g1']);
    expect(partition.completedPast.map((r) => r.id)).toEqual(['cp1']);
    expect(partition.completedCurrent.map((r) => r.id)).toEqual(['cc1']);
    expect(buildCoefficientMatrixPrimaryRows(partition).map((r) => r.id)).toEqual([
      'd1',
      'a1',
      'cc1',
      'stub',
    ]);
    expect(countPortfolioFillInitiatives([partition.inactive[0], partition.active[0]])).toBe(2);
  });

  it('detects signal in selected quarters', () => {
    const r = row({
      id: 'x',
      quarterlyData: { '2026-Q3': { ...createEmptyQuarterData(), effortCoefficient: 3 } },
    });
    expect(hasInitiativeSignalInQuarters(r, ['2026-Q1'])).toBe(false);
    expect(hasInitiativeSignalInQuarters(r, ['2026-Q3'])).toBe(true);
  });
});
