import { describe, expect, it } from 'vitest';
import { convertFromDB } from '@/lib/dataManager';
import { resolveTimelineStakeholders, type AdminDataRow } from '@/lib/adminDataManager';

const row = (
  overrides: Partial<Pick<AdminDataRow, 'stakeholdersList' | 'stakeholders'>>
): Pick<AdminDataRow, 'stakeholdersList' | 'stakeholders'> => ({
  stakeholdersList: [],
  stakeholders: '',
  ...overrides,
});

describe('resolveTimelineStakeholders', () => {
  it('uses stakeholdersList when non-empty', () => {
    expect(
      resolveTimelineStakeholders(
        row({
          stakeholdersList: ['Europe', 'Russia'],
          stakeholders: 'Legacy, Old',
        })
      )
    ).toBe('Russia, Europe');
  });

  it('falls back to legacy stakeholders string when list is empty', () => {
    expect(
      resolveTimelineStakeholders(row({ stakeholders: '  Geo derived  ' }))
    ).toBe('Geo derived');
  });

  it('returns empty string when both are empty', () => {
    expect(resolveTimelineStakeholders(row({}))).toBe('');
  });
});

describe('convertFromDB stakeholders', () => {
  const baseAdminRow = (): AdminDataRow =>
    ({
      id: 'id-1',
      unit: 'U',
      team: 'T',
      initiative: 'I',
      stakeholdersList: [],
      description: '',
      documentationLink: '',
      stakeholders: 'Legacy only',
      quarterlyData: { '2026-Q1': { cost: 100, support: false, onTrack: true } },
    }) as AdminDataRow;

  it('maps stakeholders from list when admin selected clusters', () => {
    const adminRow = baseAdminRow();
    adminRow.stakeholdersList = ['MENA', 'Russia'];
    adminRow.stakeholders = 'Outdated CSV';

    const { rawData } = convertFromDB([adminRow]);
    expect(rawData[0]?.stakeholders).toBe('Russia, MENA');
  });

  it('keeps legacy stakeholders when list is empty', () => {
    const { rawData } = convertFromDB([baseAdminRow()]);
    expect(rawData[0]?.stakeholders).toBe('Legacy only');
  });
});
