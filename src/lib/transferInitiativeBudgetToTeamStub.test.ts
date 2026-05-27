import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  computeTransferAddByQuarter,
  computeTransferAddFromEffort,
  hasTransferableBudget,
  pickCanonicalTeamStub,
} from './transferInitiativeBudgetToTeamStub';

describe('pickCanonicalTeamStub', () => {
  it('prefers FOT / team cost stub over accidental stub flag', () => {
    const chosen = pickCanonicalTeamStub([
      { id: 'a', initiative: 'Моя инициатива', created_at: '2026-01-02' },
      {
        id: 'b',
        initiative: 'Стоимость команды X-men(u) 2026',
        created_at: '2026-01-10',
      },
    ]);
    expect(chosen?.id).toBe('b');
  });

  it('returns the only stub when alone', () => {
    const chosen = pickCanonicalTeamStub([
      { id: 'x', initiative: 'ФОТ X-men(u) Q2-Q4 26', created_at: null },
    ]);
    expect(chosen?.id).toBe('x');
  });
});

describe('computeTransferAddByQuarter', () => {
  it('uses quarterly cost when present', () => {
    const add = computeTransferAddByQuarter(
      {
        '2026-Q1': { cost: 100, otherCosts: 0, effortCoefficient: 10 },
        '2026-Q2': { cost: 0, otherCosts: 0, effortCoefficient: 0 },
      },
      [{ budget_department: 'X', q1: 999, q2: 0, q3: 0, q4: 0, is_in_pnl_it: true }]
    );
    expect(add['2026-Q1']).toBe(100);
    expect(add['2026-Q2']).toBe(0);
  });

  it('falls back to split when quarterly cost is zero', () => {
    const add = computeTransferAddByQuarter(
      { '2026-Q1': { cost: 0, otherCosts: 0, effortCoefficient: 5 } },
      [{ budget_department: 'X', q1: 50, q2: 50, q3: 0, q4: 0, is_in_pnl_it: true }]
    );
    expect(add['2026-Q1']).toBe(50);
    expect(add['2026-Q2']).toBe(50);
    expect(hasTransferableBudget({ '2026-Q1': { cost: 0, otherCosts: 0 } }, [])).toBe(false);
    expect(
      hasTransferableBudget(
        { '2026-Q1': { cost: 0, otherCosts: 0 } },
        [{ budget_department: 'X', q1: 1, q2: 0, q3: 0, q4: 0, is_in_pnl_it: true }]
      )
    ).toBe(true);
  });

  it('uses effort % × team quarter total when cost and split are zero', () => {
    const teamRows: AdminDataRow[] = [
      {
        id: 'stub',
        unit: 'U',
        team: 'T',
        initiative: 'Стоимость команды T 2026',
        stakeholdersList: [],
        description: '',
        documentationLink: '',
        stakeholders: '',
        isTimelineStub: true,
        quarterlyData: {
          '2026-Q1': { cost: 1_000_000, otherCosts: 0, effortCoefficient: 0 },
        },
      },
      {
        id: 'del',
        unit: 'U',
        team: 'T',
        initiative: 'To delete',
        stakeholdersList: [],
        description: '',
        documentationLink: '',
        stakeholders: '',
        isTimelineStub: false,
        quarterlyData: {
          '2026-Q1': { cost: 0, otherCosts: 0, effortCoefficient: 10 },
        },
      },
    ];
    const add = computeTransferAddFromEffort(teamRows[1].quarterlyData, teamRows);
    expect(add['2026-Q1']).toBe(100_000);
    expect(
      hasTransferableBudget(
        teamRows[1].quarterlyData,
        [],
        teamRows
      )
    ).toBe(true);
    expect(
      computeTransferAddByQuarter(teamRows[1].quarterlyData, [], teamRows)['2026-Q1']
    ).toBe(100_000);
  });
});
