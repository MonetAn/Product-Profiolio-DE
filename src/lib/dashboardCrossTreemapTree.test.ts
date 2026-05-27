import { describe, expect, it } from 'vitest';
import {
  buildDashboardCrossOnlyTree,
  buildDashboardCrossPortfolioTree,
  buildPortfolioRestTree,
  PORTFOLIO_REST_NODE_NAME,
} from '@/lib/dashboardCrossTreemapTree';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { CrossInitiativesBundle } from '@/lib/crossInitiativeModel';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';

const row = (partial: Partial<AdminDataRow> & Pick<AdminDataRow, 'id' | 'unit' | 'team' | 'initiative'>): AdminDataRow =>
  ({
    description: '',
    stakeholders: '',
    quarterlyData: { '2026-Q1': { cost: 100, effortCoefficient: 1 } },
    ...partial,
  }) as AdminDataRow;

const buildOptions = {
  selectedQuarters: ['2026-Q1'],
  supportFilter: 'all' as const,
  showOnlyOfftrack: false,
  hideStubs: false,
  selectedStakeholders: [] as string[],
  showTeams: true,
  showInitiatives: true,
};

describe('buildPortfolioRestTree', () => {
  it('shows only initiatives not in any cross-initiative', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      ['i1', row({ id: 'i1', unit: 'Tech Platform', team: 'Core', initiative: 'In cross' })],
      ['i2', row({ id: 'i2', unit: 'Tech Platform', team: 'Core', initiative: 'Local only' })],
    ]);

    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [{ id: 'c1', name: 'Cross A', description: null, created_at: '', updated_at: '' }],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'In cross',
          unit: 'Tech Platform',
          team: 'Core',
          can_view_details: true,
        },
      ],
    };

    const rawData = [
      {
        unit: 'Tech Platform',
        team: 'Core',
        initiative: 'In cross',
        description: '',
        stakeholders: '',
        quarterlyData: { '2026-Q1': { cost: 100, effortCoefficient: 1 } },
        adminInitiativeRowId: 'i1',
      },
      {
        unit: 'Tech Platform',
        team: 'Core',
        initiative: 'Local only',
        description: '',
        stakeholders: '',
        quarterlyData: { '2026-Q1': { cost: 50, effortCoefficient: 1 } },
        adminInitiativeRowId: 'i2',
      },
    ];

    const rest = buildPortfolioRestTree(rawData, bundle, buildOptions);
    expect(rest?.name).toBe(PORTFOLIO_REST_NODE_NAME);
    expect(rest?.isPortfolioRest).toBe(true);
    expect(rest?.isPortfolioUnit).toBeFalsy();

    const leaves = rest?.children?.[0]?.children?.[0]?.children ?? [];
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.name).toBe('Local only');
    expect(leaves[0]?.adminInitiativeRowId).toBe('i2');
  });
});

describe('buildDashboardCrossPortfolioTree', () => {
  it('combines cross nodes and portfolio rest without portfolio units', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      ['i1', row({ id: 'i1', unit: 'U1', team: 'T', initiative: 'A' })],
      ['i2', row({ id: 'i2', unit: 'U1', team: 'T', initiative: 'B' })],
    ]);
    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [{ id: 'c1', name: 'Cross A', description: null, created_at: '', updated_at: '' }],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'A',
          unit: 'U1',
          team: 'T',
          can_view_details: true,
        },
      ],
    };

    const rawData = [
      {
        unit: 'U1',
        team: 'T',
        initiative: 'A',
        description: '',
        stakeholders: '',
        quarterlyData: { '2026-Q1': { cost: 100, effortCoefficient: 1 } },
        adminInitiativeRowId: 'i1',
      },
      {
        unit: 'U1',
        team: 'T',
        initiative: 'B',
        description: '',
        stakeholders: '',
        quarterlyData: { '2026-Q1': { cost: 40, effortCoefficient: 1 } },
        adminInitiativeRowId: 'i2',
      },
    ];

    const tree = prepareStaticTreemapTree(
      buildDashboardCrossPortfolioTree({
        rawData,
        bundle,
        initiativeById,
        buildOptions,
      })
    );

    const cross = tree.children?.find((c) => c.isCrossInitiative);
    const rest = tree.children?.find((c) => c.isPortfolioRest);
    expect(cross?.name).toBe('Cross A');
    expect(rest?.name).toBe(PORTFOLIO_REST_NODE_NAME);
    expect(tree.children?.some((c) => c.isPortfolioUnit)).toBe(false);
  });

  it('filters crosses by unit when one unit is selected', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      ['i1', row({ id: 'i1', unit: 'U1', team: 'T', initiative: 'A' })],
    ]);
    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [
        { id: 'c1', name: 'For U1', description: null, created_at: '', updated_at: '' },
        { id: 'c2', name: 'Other', description: null, created_at: '', updated_at: '' },
      ],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'A',
          unit: 'U1',
          team: 'T',
          can_view_details: true,
        },
        {
          id: 'm2',
          cross_initiative_id: 'c2',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'A',
          unit: 'U2',
          team: 'T',
          can_view_details: true,
        },
      ],
    };

    const tree = buildDashboardCrossPortfolioTree({
      rawData: [
        {
          unit: 'U1',
          team: 'T',
          initiative: 'A',
          description: '',
          stakeholders: '',
          quarterlyData: { '2026-Q1': { cost: 10, effortCoefficient: 1 } },
          adminInitiativeRowId: 'i1',
        },
      ],
      bundle,
      initiativeById,
      buildOptions: { ...buildOptions, selectedUnits: ['U1'] },
      selectedUnitFilter: 'U1',
      showCrossesForSelectedUnit: true,
    });

    const names = (tree.children ?? []).map((c) => c.name);
    expect(names).toContain('For U1');
    expect(names).not.toContain('Other');
  });

  it('keeps crosses when only PnL IT is on and initiative has no PnL budget in period', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      [
        'i1',
        row({
          id: 'i1',
          unit: 'U1',
          team: 'T',
          initiative: 'Effort only',
          quarterlyData: { '2026-Q1': { cost: 0, effortCoefficient: 5 } },
        }),
      ],
    ]);
    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [{ id: 'c1', name: 'Cross', description: null, created_at: '', updated_at: '' }],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'Effort only',
          unit: 'U1',
          team: 'T',
          can_view_details: true,
        },
      ],
    };

    const tree = buildDashboardCrossOnlyTree(
      bundle,
      initiativeById,
      ['2026-Q1'],
      undefined,
      [],
      { ...buildOptions, includeNonPnlBudgets: false, showTeams: false, showInitiatives: false }
    );

    expect(tree.children?.length).toBe(1);
  });

  it('keeps crosses visible when treemap level toggles are off but unit filter matches', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      ['i1', row({ id: 'i1', unit: 'U1', team: 'T', initiative: 'A' })],
    ]);
    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [{ id: 'c1', name: 'Cross', description: null, created_at: '', updated_at: '' }],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 100,
          initiative_name: 'A',
          unit: 'U1',
          team: 'T',
          can_view_details: true,
        },
      ],
    };

    const rawData = [
      {
        unit: 'U1',
        team: 'T',
        initiative: 'A',
        description: '',
        stakeholders: '',
        quarterlyData: { '2026-Q1': { cost: 10, effortCoefficient: 1 } },
        adminInitiativeRowId: 'i1',
      },
    ];

    const tree = buildDashboardCrossOnlyTree(
      bundle,
      initiativeById,
      ['2026-Q1'],
      undefined,
      rawData,
      { ...buildOptions, showTeams: false, showInitiatives: false, selectedUnits: ['U1'] }
    );

    expect(tree.children?.length).toBe(1);
    expect(tree.children?.[0]?.name).toBe('Cross');
  });

  it('keeps all teams inside cross when filtering by one team (like admin overview)', () => {
    const initiativeById = new Map<string, AdminDataRow>([
      ['i1', row({ id: 'i1', unit: 'U1', team: 'Team A', initiative: 'X' })],
      ['i2', row({ id: 'i2', unit: 'U2', team: 'Team B', initiative: 'Y' })],
    ]);
    const bundle: CrossInitiativesBundle = {
      crossInitiatives: [{ id: 'c1', name: 'Mixed', description: null, created_at: '', updated_at: '' }],
      members: [
        {
          id: 'm1',
          cross_initiative_id: 'c1',
          initiative_id: 'i1',
          cost_share_pct: 50,
          initiative_name: 'X',
          unit: 'U1',
          team: 'Team A',
          can_view_details: true,
        },
        {
          id: 'm2',
          cross_initiative_id: 'c1',
          initiative_id: 'i2',
          cost_share_pct: 50,
          initiative_name: 'Y',
          unit: 'U2',
          team: 'Team B',
          can_view_details: true,
        },
      ],
    };

    const tree = buildDashboardCrossOnlyTree(
      bundle,
      initiativeById,
      ['2026-Q1'],
      undefined,
      [],
      { ...buildOptions, selectedTeams: ['Team A'] }
    );

    const cross = tree.children?.find((c) => c.name === 'Mixed');
    expect(cross).toBeDefined();
    const unitNames = cross?.children?.map((u) => u.name) ?? [];
    expect(unitNames).toContain('U1');
    expect(unitNames).toContain('U2');
    const teams = (cross?.children ?? []).flatMap((u) => u.children?.map((t) => t.name) ?? []);
    expect(teams).toContain('Team A');
    expect(teams).toContain('Team B');
    expect(cross?.displayBudget).toBe(100);
  });
});
