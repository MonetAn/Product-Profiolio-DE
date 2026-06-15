import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  buildEffortTreemapPreviewModel,
  rowsAfterSimulatedDeletes,
  teamPeriodCostSum,
} from '@/lib/adminEffortTreemapPreviewModel';

function row(
  id: string,
  initiative: string,
  cost: number,
  effort = 0,
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

describe('rowsAfterSimulatedDeletes', () => {
  it('keeps team total and puts unreassigned share on stub when remaining rows have no effort', () => {
    const baseline = [
      row('stub', 'Стоимость команды T', 8_000_000, 0, true),
      row('a', 'A', 2_000_000, 0),
      row('b', 'B', 1_000_000, 0),
    ];
    const current = [baseline[0], baseline[2]];
    const qs = ['2026-Q1'];
    const beforeTotal = teamPeriodCostSum(baseline, qs);
    const afterRows = rowsAfterSimulatedDeletes(baseline, current, qs);
    const afterTotal = teamPeriodCostSum(afterRows, qs);
    expect(afterTotal).toBe(beforeTotal);

    const stub = afterRows.find((r) => r.isTimelineStub);
    expect(stub?.quarterlyData['2026-Q1']?.cost).toBe(11_000_000);

    const beforeModel = buildEffortTreemapPreviewModel(baseline, qs);
    const afterModel = buildEffortTreemapPreviewModel(afterRows, qs, {
      fixedEffectiveTotal: beforeModel.effectiveTotal,
    });
    expect(afterModel.effectiveTotal).toBe(beforeModel.effectiveTotal);
  });
});
