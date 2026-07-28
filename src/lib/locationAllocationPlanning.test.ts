import { describe, expect, it } from 'vitest';
import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import type { Person, PersonAssignment } from '@/lib/peopleDataManager';
import {
  buildInitiativesRegionPayments,
  buildLocationHeadcountIndex,
  calculateTeamRun,
  locationTeamKey,
  sumTeamCostForYear,
} from '@/lib/locationAllocationPlanning';

function quarter(
  cost: number,
  support = false,
  effortCoefficient = 0
): AdminQuarterData {
  return {
    cost,
    otherCosts: 0,
    support,
    onTrack: true,
    metricPlan: '',
    metricFact: '',
    comment: '',
    effortCoefficient,
  };
}

function initiative(
  id: string,
  quarterlyData: Record<string, AdminQuarterData>
): AdminDataRow {
  return {
    id,
    unit: 'Unit A',
    team: 'Team A',
    initiative: id,
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData,
  };
}

function person(id: string, terminatedAt: string | null = null): Person {
  return {
    id,
    external_id: null,
    full_name: id,
    email: `${id}@example.com`,
    hr_structure: null,
    unit: 'Unit A',
    team: 'Team A',
    position: null,
    leader: null,
    hired_at: null,
    terminated_at: terminatedAt,
    created_at: null,
    updated_at: null,
  };
}

describe('location allocation planning', () => {
  it('counts only active people by unit and team', () => {
    const index = buildLocationHeadcountIndex([
      person('one'),
      person('two'),
      person('left', '2026-01-01'),
    ]);

    expect(index.byUnit.get('Unit A')).toBe(2);
    expect(index.byTeam.get(locationTeamKey('Unit A', 'Team A'))).toBe(2);
  });

  it('sums FOT from cost and other costs for the selected year', () => {
    const row = initiative('initiative', {
      '2025-Q4': { ...quarter(100), otherCosts: 20 },
      '2026-Q1': { ...quarter(200), otherCosts: 30 },
      '2026-Q2': quarter(300),
    });

    expect(sumTeamCostForYear([row], 2025)).toBe(120);
    expect(sumTeamCostForYear([row], 2026)).toBe(530);
  });

  it('calculates RUN from personal support assignments when they exist', () => {
    const rows = [
      initiative('support', {
        '2026-Q1': quarter(0, true, 50),
        '2026-Q2': quarter(0, true, 50),
      }),
    ];
    const people = [person('one'), person('two')];
    const assignments: PersonAssignment[] = [
      {
        id: 'a1',
        person_id: 'one',
        initiative_id: 'support',
        quarterly_effort: { '2026-Q1': 100, '2026-Q2': 50 },
        is_auto: false,
        created_at: null,
        updated_at: null,
      },
    ];

    const result = calculateTeamRun(
      rows,
      people,
      assignments,
      ['2026-Q1', '2026-Q2'],
      1_000,
      2
    );

    expect(result.source).toBe('assignments');
    expect(result.supportFte).toBe(0.75);
    expect(result.supportShare).toBe(0.375);
    expect(result.runRub).toBe(375);
  });

  it('falls back to initiative support effort without personal assignments', () => {
    const rows = [
      initiative('support', {
        '2026-Q1': quarter(0, true, 40),
        '2026-Q2': quarter(0, true, 60),
      }),
    ];

    const result = calculateTeamRun(
      rows,
      [person('one'), person('two')],
      [],
      ['2026-Q1', '2026-Q2'],
      1_000,
      2
    );

    expect(result.source).toBe('initiative-effort');
    expect(result.supportFte).toBe(1);
    expect(result.supportShare).toBe(0.5);
    expect(result.runRub).toBe(500);
  });

  it('aggregates regional payments across initiatives', () => {
    const first = initiative('first', {
      '2026-Q1': quarter(100),
    });
    first.initiativeGeoCostSplit = {
      entries: [
        { kind: 'cluster', clusterKey: 'Russia', percent: 50 },
        { kind: 'cluster', clusterKey: 'Europe', percent: 50 },
      ],
    };
    const second = initiative('second', {
      '2026-Q1': quarter(100),
    });
    second.initiativeGeoCostSplit = {
      entries: [
        { kind: 'cluster', clusterKey: 'Drinkit', percent: 100 },
      ],
    };

    expect(
      buildInitiativesRegionPayments(
        [first, second],
        ['2026-Q1'],
        [],
        new Map()
      )
    ).toEqual([
      { region: 'Domestic Region', rub: 50, percent: 25 },
      { region: 'International Region', rub: 50, percent: 25 },
      { region: 'Drink It', rub: 100, percent: 50 },
    ]);
  });
});
