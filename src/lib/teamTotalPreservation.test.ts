import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { rowsAfterSimulatedDeletes, teamPeriodCostSum } from '@/lib/adminEffortTreemapPreviewModel';
import {
  buildQuarterlyCostsForTeam,
  frozenTeamQuarterTotals,
} from '@/lib/redistributeTeamCosts2026';
import { buildQuarterlyDataFromPreview } from '@/lib/adminQuickFlowRedistributeCosts';

function row(
  id: string,
  initiative: string,
  cost: number,
  effort: number,
  stub = false
): AdminDataRow {
  return {
    id,
    unit: 'Data Office',
    team: 'Codo',
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

describe('team total preservation', () => {
  it('delete path preserves frozen live Tq when baseline differs', () => {
    const liveTotal = 10_536_000; // live выше baseline на 536k
    const before = [
      row('stub', 'Не распределено', 2_000_000, 0, true),
      row('a', 'Init A', 4_000_000, 40),
      row('b', 'Init B', 3_000_000, 30),
      row('c', 'Init C', 1_536_000, 15),
    ];
    expect(teamPeriodCostSum(before, ['2026-Q1'])).toBe(liveTotal);

    const afterDelete = [before[0], before[1], before[2]];
    const frozen = frozenTeamQuarterTotals(before, ['2026-Q1']);

    // Именно так вызывает redistributeTeamCosts2026InDb после delete в БД:
    const dbPath = buildQuarterlyCostsForTeam(afterDelete, ['2026-Q1'], {
      fixedTqByQuarter: frozen,
    });
    const dbTotal = teamPeriodCostSum(
      afterDelete.map((r) => ({ ...r, quarterlyData: dbPath.get(r.id)! })),
      ['2026-Q1']
    );

    // Ожидание пользователя: тотал команды не меняется после delete
    expect(dbTotal).toBe(liveTotal);
  });

  it('preview delete and DB path agree when both use frozen Tq', () => {
    const liveTotal = 10_536_000;
    const before = [
      row('stub', 'Не распределено', 2_000_000, 0, true),
      row('a', 'Init A', 4_000_000, 40),
      row('b', 'Init B', 3_000_000, 30),
      row('c', 'Init C', 1_536_000, 15),
    ];
    const afterDelete = [before[0], before[1], before[2]];

    const previewRows = rowsAfterSimulatedDeletes(before, afterDelete, ['2026-Q1']);
    const previewTotal = teamPeriodCostSum(previewRows, ['2026-Q1']);
    expect(previewTotal).toBe(liveTotal);

    // БД-путь с frozen Tq — тот же тотал, что preview
    const frozen = frozenTeamQuarterTotals(before, ['2026-Q1']);
    const dbPath = buildQuarterlyCostsForTeam(afterDelete, ['2026-Q1'], {
      fixedTqByQuarter: frozen,
    });
    const dbTotal = teamPeriodCostSum(
      afterDelete.map((r) => ({ ...r, quarterlyData: dbPath.get(r.id)! })),
      ['2026-Q1']
    );
    expect(dbTotal).toBe(previewTotal);
  });

  it('Quick Flow blocks save when Σeff>100%', () => {
    const Tq = 10_000_000;
    const team = [
      row('stub', 'stub', 0, 0, true),
      row('a', 'A', 5_000_000, 60),
      row('b', 'B', 5_000_000, 50),
    ];
    expect(() => buildQuarterlyDataFromPreview(team, ['2026-Q1'])).toThrow(/100/);
  });

  it('Quick Flow add initiative + reassign effort preserves team total', () => {
    const Tq = 10_000_000;
    const before = [
      row('stub', 'stub', 6_000_000, 0, true),
      row('a', 'A', 4_000_000, 40),
    ];
    const afterAdd = [
      ...before,
      row('new', 'New initiative', 0, 20),
    ];
    // Перераспределяем: A=40%, New=20%, stub=40%
    const built = buildQuarterlyDataFromPreview(afterAdd, ['2026-Q1']);
    const result = afterAdd.map((r) => ({ ...r, quarterlyData: built.get(r.id)! }));
    expect(teamPeriodCostSum(result, ['2026-Q1'])).toBe(Tq);
  });

  it('delete path preserves frozen Tq when baseline is higher than live', () => {
    const liveTotal = 10_000_000;
    const before = [
      row('stub', 'stub', 3_000_000, 0, true),
      row('a', 'A', 4_000_000, 40),
      row('b', 'Init to delete', 3_000_000, 30),
    ];
    const afterDelete = [before[0], before[1]];
    const frozen = frozenTeamQuarterTotals(before, ['2026-Q1']);

    const dbPath = buildQuarterlyCostsForTeam(afterDelete, ['2026-Q1'], {
      fixedTqByQuarter: frozen,
    });
    const dbTotal = teamPeriodCostSum(
      afterDelete.map((r) => ({ ...r, quarterlyData: dbPath.get(r.id)! })),
      ['2026-Q1']
    );
    expect(dbTotal).toBe(liveTotal);
  });
});
