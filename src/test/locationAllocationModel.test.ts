import { describe, expect, it } from 'vitest';
import {
  allocateCostToClusters,
  buildAsIsRevenueSplit,
  clusterPercentsToGeoSplit,
  initiativeQuarterCostRub,
} from '@/lib/locationAllocationModel';
import type { AdminDataRow } from '@/lib/adminDataManager';

const mockCountries = [
  {
    id: 'c1',
    cluster_key: 'Russia',
    label_ru: 'Россия',
    sort_order: 1,
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'c2',
    cluster_key: 'Drinkit',
    label_ru: 'Drinkit',
    sort_order: 2,
    is_active: true,
    created_at: '',
    updated_at: '',
  },
] as const;

describe('locationAllocationModel', () => {
  it('buildAsIsRevenueSplit returns 100% on active countries', () => {
    const split = buildAsIsRevenueSplit([...mockCountries]);
    expect(split?.entries.length).toBe(2);
    const sum = split!.entries.reduce((s, e) => s + e.percent, 0);
    expect(sum).toBe(100);
  });

  it('allocateCostToClusters sums to effective cost', () => {
    const split = clusterPercentsToGeoSplit({ Russia: 70, Drinkit: 30 });
    const map = allocateCostToClusters(1_000_000, split, new Map([['c1', 'Russia']]));
    const sum = [...map.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(1_000_000);
    expect(map.get('Russia')).toBeGreaterThan(0);
  });

  it('initiativeQuarterCostRub includes otherCosts', () => {
    const row: AdminDataRow = {
      id: '1',
      unit: 'U',
      team: 'T',
      initiative: 'I',
      stakeholdersList: [],
      description: '',
      documentationLink: '',
      stakeholders: '',
      quarterlyData: {
        '2026-Q1': {
          cost: 100,
          otherCosts: 50,
          support: false,
          onTrack: true,
          metricPlan: '',
          metricFact: '',
          comment: '',
          effortCoefficient: 0,
        },
      },
    };
    expect(initiativeQuarterCostRub(row, '2026-Q1')).toBe(150);
  });
});
