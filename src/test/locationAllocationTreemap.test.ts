import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { getUnitColor } from '@/lib/dataManager';
import { layoutD3SubtreeInRect } from '@/lib/treemapD3Layout';
import {
  buildLocationAllocationTreemapMeta,
  buildLocationAllocationTreemapTree,
  collectLocationTreemapInitiativeIds,
  prepareLocationAllocationTreemapTree,
  resolveLocationTreemapNodeYearCost,
} from '@/lib/locationAllocationTreemap';
import type { TreemapLayoutNode } from '@/components/treemap/types';

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
        comment: '',
        effortCoefficient: 10,
      },
    },
    ...overrides,
  };
}

function findInitiativeLayoutNode(root: TreemapLayoutNode): TreemapLayoutNode | null {
  if (root.isInitiative || root.data.isInitiative) return root;
  for (const child of root.children ?? []) {
    const found = findInitiativeLayoutNode(child);
    if (found) return found;
  }
  return null;
}

describe('locationAllocationTreemap drill-down cost', () => {
  const yearQuarters = ['2026-Q1'];
  const countries = [
    {
      id: 'c1',
      cluster_key: 'Russia',
      label_ru: 'Россия',
      sort_order: 1,
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  ] as const;
  const countryIdToClusterKey = new Map([['c1', 'Russia']]);

  it('shows year cost on initiative leaf after zoom into team', () => {
    const rows = [
      sampleRow({ id: 'init-1', initiative: 'Alpha' }),
      sampleRow({
        id: 'init-2',
        initiative: 'Beta',
        team: '',
        quarterlyData: {
          '2026-Q1': {
            cost: 500_000,
            otherCosts: 0,
            support: false,
            onTrack: true,
            metricPlan: '',
            metricFact: '',
            comment: '',
            effortCoefficient: 5,
          },
        },
      }),
    ];

    const tree = prepareLocationAllocationTreemapTree(
      buildLocationAllocationTreemapTree(rows, yearQuarters, {
        showTeams: true,
        showInitiatives: true,
      })
    );
    const meta = buildLocationAllocationTreemapMeta(
      rows,
      yearQuarters,
      [...countries],
      countryIdToClusterKey
    );

    const unit = tree.children?.[0];
    expect(unit).toBeTruthy();
    const team = unit!.children?.find((c) => c.isTeam);
    expect(team).toBeTruthy();

    const layoutRoot = layoutD3SubtreeInRect(
      team!,
      0,
      0,
      800,
      600,
      getUnitColor,
      3,
      unit!.name,
      0,
      `${unit!.name}/${team!.name}`
    );

    const initiativeNode = findInitiativeLayoutNode(layoutRoot);
    expect(initiativeNode).toBeTruthy();

    const ids = collectLocationTreemapInitiativeIds(initiativeNode!, meta);
    const fullCost = resolveLocationTreemapNodeYearCost(initiativeNode!, meta);

    expect(ids.length).toBeGreaterThan(0);
    expect(fullCost).toBeGreaterThan(0);
    expect(fullCost).toBe(meta.yearCostByInitiativeId.get(ids[0]!) ?? 0);
  });

  it('resolves cost for team "Без команды" via fallback', () => {
    const rows = [
      sampleRow({
        id: 'stub-1',
        team: '',
        initiative: '',
        isTimelineStub: true,
      }),
    ];

    const tree = prepareLocationAllocationTreemapTree(
      buildLocationAllocationTreemapTree(rows, yearQuarters, {
        showTeams: true,
        showInitiatives: true,
      })
    );
    const meta = buildLocationAllocationTreemapMeta(
      rows,
      yearQuarters,
      [...countries],
      countryIdToClusterKey
    );

    const unit = tree.children?.[0];
    const team = unit!.children?.find((c) => c.name === 'Без команды');
    expect(team).toBeTruthy();

    const layoutRoot = layoutD3SubtreeInRect(
      team!,
      0,
      0,
      800,
      600,
      getUnitColor,
      2,
      unit!.name,
      0,
      `${unit!.name}/Без команды`
    );

    const initiativeNode = findInitiativeLayoutNode(layoutRoot);
    expect(initiativeNode).toBeTruthy();

    const ids = collectLocationTreemapInitiativeIds(initiativeNode!, meta);
    const fullCost = resolveLocationTreemapNodeYearCost(initiativeNode!, meta);
    expect(fullCost).toBe(1_000_000);
  });
});
