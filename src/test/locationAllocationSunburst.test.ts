import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  buildLocationAllocationSunburstTree,
  layoutLocationAllocationSunburst,
} from '@/lib/locationAllocationSunburst';
import { getUnitColor } from '@/lib/dataManager';

function sampleRow(overrides: Partial<AdminDataRow> & Pick<AdminDataRow, 'id'>): AdminDataRow {
  return {
    id: overrides.id,
    unit: overrides.unit ?? 'App&Web',
    team: overrides.team ?? 'Platform',
    initiative: overrides.initiative ?? 'Auth',
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData: overrides.quarterlyData ?? {
      '2026-Q1': {
        cost: 1_000_000,
        otherCosts: 0,
        support: false,
        onTrack: true,
        metricPlan: '',
        metricFact: '',
        effortCoefficient: 0,
      },
    },
    ...overrides,
  };
}

describe('buildLocationAllocationSunburstTree', () => {
  it('builds unit → team → initiative → region hierarchy', () => {
    const rows = [
      sampleRow({ id: '1', unit: 'App&Web', team: 'Platform', initiative: 'Auth' }),
      sampleRow({
        id: '2',
        unit: 'App&Web',
        team: 'Platform',
        initiative: 'Payments',
        quarterlyData: {
          '2026-Q1': {
            cost: 500_000,
            otherCosts: 0,
            support: false,
            onTrack: true,
            metricPlan: '',
            metricFact: '',
            effortCoefficient: 0,
          },
        },
      }),
    ];

    const tree = buildLocationAllocationSunburstTree(rows, ['2026-Q1'], [], new Map());
    expect(tree.children).toHaveLength(1);
    const unit = tree.children![0];
    expect(unit.isUnit).toBe(true);
    expect(unit.name).toBe('App&Web');

    const team = unit.children![0];
    expect(team.isTeam).toBe(true);
    expect(team.name).toBe('Platform');
    expect(team.children).toHaveLength(2);

    const initiative = team.children![0];
    expect(initiative.isInitiative).toBe(true);
    expect(initiative.children!.length).toBeGreaterThan(0);
    expect(initiative.children![0].isLocationRegion).toBe(true);
    expect(initiative.children![0].value).toBeGreaterThan(0);
  });

  it('layout produces four depth levels', () => {
    const rows = [sampleRow({ id: '1' })];
    const tree = buildLocationAllocationSunburstTree(rows, ['2026-Q1'], [], new Map());
    const { nodes, totalValue } = layoutLocationAllocationSunburst(
      tree,
      400,
      48,
      40,
      getUnitColor
    );

    expect(totalValue).toBe(1_000_000);
    const depths = new Set(nodes.map((n) => n.depth));
    expect(depths.has(1)).toBe(true);
    expect(depths.has(2)).toBe(true);
    expect(depths.has(3)).toBe(true);
    expect(depths.has(4)).toBe(true);
  });
});
