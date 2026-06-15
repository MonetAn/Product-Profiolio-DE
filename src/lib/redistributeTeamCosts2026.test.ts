import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  buildQuarterlyCostsForTeam,
  frozenTeamQuarterTotals,
} from '@/lib/redistributeTeamCosts2026';
import { buildQuarterlyDataFromPreview } from '@/lib/adminQuickFlowRedistributeCosts';
import type { TeamBaselineRow } from '@/lib/budgetTruth2026';
import { teamPeriodCostSum } from '@/lib/adminEffortTreemapPreviewModel';

function row(
  id: string,
  initiative: string,
  cost: number,
  effort: number,
  stub = false
): AdminDataRow {
  return {
    id,
    unit: 'U',
    team: 'T',
    initiative,
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    isTimelineStub: stub,
    quarterlyData: {
      '2026-Q1': { cost, otherCosts: 0, effortCoefficient: effort },
    },
  };
}

const baseline: TeamBaselineRow = {
  unit: 'U',
  team: 'T',
  q1: 10_000_000,
  q2: 0,
  q3: 0,
  q4: 0,
  rubAll: 10_000_000,
  rubPnlIt: 10_000_000,
};

describe('buildQuarterlyCostsForTeam', () => {
  it('redistributes deleted share to remaining initiatives by effort (baseline Tq)', () => {
    const before = [
      row('stub', 'Стоимость команды T', 0, 0, true),
      row('a', 'A', 3_000_000, 30),
      row('b', 'B', 5_000_000, 50),
      row('c', 'C', 2_000_000, 20),
    ];
    const afterDelete = [before[0], before[1], before[2]];
    const fixed = frozenTeamQuarterTotals(before, ['2026-Q1']);
    const built = buildQuarterlyCostsForTeam(afterDelete, ['2026-Q1'], { baseline, fixedTqByQuarter: fixed });

    expect(built.get('a')!['2026-Q1']!.cost).toBe(3_000_000);
    expect(built.get('b')!['2026-Q1']!.cost).toBe(5_000_000);
    expect(built.get('stub')!['2026-Q1']!.cost).toBe(2_000_000);

    const teamTotal = [...built.values()].reduce(
      (s, qd) => s + (qd['2026-Q1']?.cost ?? 0) + (qd['2026-Q1']?.otherCosts ?? 0),
      0
    );
    expect(teamTotal).toBe(10_000_000);
    expect(teamPeriodCostSum(afterDelete, ['2026-Q1'])).toBe(8_000_000);
  });

  it('keeps team total when simulating delete with fixed snapshot', () => {
    const before = [
      row('stub', 'stub', 8_000_000, 0, true),
      row('a', 'A', 2_000_000, 0),
    ];
    const after = [before[0]];
    const fixed = frozenTeamQuarterTotals(before, ['2026-Q1']);
    const built = buildQuarterlyCostsForTeam(after, ['2026-Q1'], { fixedTqByQuarter: fixed });
    const total = (built.get('stub')!['2026-Q1']!.cost ?? 0);
    expect(total).toBe(10_000_000);
  });
});

describe('buildQuarterlyDataFromPreview', () => {
  it('keeps team total with explicit fixed Tq after row removed from list', () => {
    const before = [
      row('stub', 'stub', 7_000_000, 0, true),
      row('a', 'A', 2_000_000, 20),
      row('b', 'B', 1_000_000, 10),
    ];
    const afterDelete = [before[0], before[1]];
    const fixed = frozenTeamQuarterTotals(before, ['2026-Q1']);
    const built = buildQuarterlyDataFromPreview(afterDelete, ['2026-Q1'], { fixedTqByQuarter: fixed });
    const total = [...built.values()].reduce(
      (s, qd) => s + (qd['2026-Q1']?.cost ?? 0),
      0
    );
    expect(total).toBe(10_000_000);
    expect(built.get('stub')!['2026-Q1']!.costFinanceConfirmed).toBe(false);
  });
});
