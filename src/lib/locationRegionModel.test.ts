import { describe, expect, it } from 'vitest';
import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { buildRegionComparisonRows } from '@/lib/locationRegionModel';

function quarter(cost: number): AdminQuarterData {
  return {
    cost,
    otherCosts: 0,
    support: false,
    onTrack: true,
    metricPlan: '',
    metricFact: '',
    comment: '',
    effortCoefficient: 0,
  };
}

describe('location region model', () => {
  it('limits regional totals to the selected market', () => {
    const russia: MarketCountryRow = {
      id: 'russia',
      cluster_key: 'Russia',
      label_ru: 'Россия',
      sort_order: 1,
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const row: AdminDataRow = {
      id: 'initiative',
      unit: 'Unit A',
      team: 'Team A',
      initiative: 'Initiative',
      stakeholdersList: [],
      description: '',
      documentationLink: '',
      stakeholders: '',
      quarterlyData: {
        '2026-Q1': quarter(100),
      },
      initiativeGeoCostSplit: {
        entries: [
          {
            kind: 'country',
            countryId: russia.id,
            percent: 100,
          },
        ],
      },
    };

    const result = buildRegionComparisonRows(
      [row],
      2026,
      [russia],
      new Map([[russia.id, russia.cluster_key]]),
      russia
    );

    expect(result.map(({ region, actualRub }) => ({ region, actualRub }))).toEqual([
      { region: 'Domestic Region', actualRub: 100 },
      { region: 'International Region', actualRub: 0 },
      { region: 'Drink It', actualRub: 0 },
    ]);
  });
});
