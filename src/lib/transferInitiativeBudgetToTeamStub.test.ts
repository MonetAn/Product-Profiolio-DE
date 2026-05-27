import { describe, expect, it } from 'vitest';
import {
  computeTransferAddByQuarter,
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
});
