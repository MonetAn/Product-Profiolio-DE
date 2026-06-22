import { describe, expect, it } from 'vitest';
import {
  computeInitiativePayback,
  computeInitiativePaybackAsOf,
  computeInitiativePaybackDashboard,
  computeInitiativePaybackForecastAtPlanningQuarter,
  computeInitiativePlanningForecastSeries,
  computePlanningForecastBreakdown,
  formatPaybackEffectCostLine,
  formatPaybackNetLine,
  formatPaybackReturnPercent,
  formatPaybackRatio,
  formatPaybackVsAmounts,
} from './initiativePayback';

describe('computeInitiativePayback', () => {
  it('returns null when no revenue quarters in period', () => {
    expect(
      computeInitiativePayback(
        { '2026-Q1': { budget: 1_000_000 } },
        ['2026-Q1']
      )
    ).toBeNull();
  });

  it('sums only quarters with revenue and matching cost', () => {
    const summary = computeInitiativePayback(
      {
        '2026-Q1': { budget: 1_000_000 },
        '2026-Q2': { budget: 500_000, revenueRub: 2_000_000 },
        '2026-Q3': { budget: 300_000, revenueRub: 400_000 },
      },
      ['2026-Q1', '2026-Q2', '2026-Q3']
    );
    expect(summary).toMatchObject({
      periodRevenue: 2_400_000,
      periodCost: 800_000,
      ratio: 3,
      isPaidOff: true,
      revenueQuarters: ['2026-Q2', '2026-Q3'],
    });
  });

  it('marks not paid off when revenue < cost', () => {
    const summary = computeInitiativePayback(
      { '2026-Q2': { budget: 2_000_000, revenueRub: 1_000_000 } },
      ['2026-Q2']
    );
    expect(summary?.isPaidOff).toBe(false);
    expect(summary?.ratio).toBe(0.5);
  });
});

describe('computeInitiativePaybackDashboard', () => {
  const data = {
    '2026-Q1': { budget: 1_000_000, revenueRub: 500_000 },
    '2026-Q2': { budget: 2_000_000, revenueRub: 3_000_000 },
    '2026-Q3': { budget: 500_000 },
    '2026-Q4': { budget: 800_000, revenueRub: 1_000_000 },
  };

  it('returns null when no revenue in year', () => {
    expect(
      computeInitiativePaybackDashboard(
        { '2026-Q1': { budget: 1_000_000 } },
        { asOfQuarter: '2026-Q2' }
      )
    ).toBeNull();
  });

  it('computes YTD and full year horizons', () => {
    const dash = computeInitiativePaybackDashboard(data, { asOfQuarter: '2026-Q2' });
    expect(dash?.now).toMatchObject({
      periodCost: 3_000_000,
      periodRevenue: 3_500_000,
      isPaidOff: true,
    });
    expect(dash?.yearEnd).toMatchObject({
      periodCost: 4_300_000,
      periodRevenue: 4_500_000,
      isPaidOff: true,
    });
  });
});

describe('computeInitiativePaybackAsOf with history', () => {
  it('uses last history entry per quarter as of checkpoint', () => {
    const data = {
      '2026-Q2': {
        budget: 2_000_000,
        revenueRub: 3_000_000,
        revenueRubHistory: [
          { value: 1_000_000, at: '2026-01-10T10:00:00.000Z', setInQuarter: '2026-Q1' },
          { value: 2_000_000, at: '2026-04-15T10:00:00.000Z', setInQuarter: '2026-Q2' },
        ],
        costHistory: [
          {
            cost: 1_500_000,
            otherCosts: 0,
            total: 1_500_000,
            at: '2026-01-10T10:00:00.000Z',
            setInQuarter: '2026-Q1',
          },
          {
            cost: 2_000_000,
            otherCosts: 0,
            total: 2_000_000,
            at: '2026-04-15T10:00:00.000Z',
            setInQuarter: '2026-Q2',
          },
        ],
      },
    };

    const q1 = computeInitiativePaybackAsOf(data, '2026-Q1', ['2026-Q2']);
    expect(q1?.periodRevenue).toBe(1_000_000);
    expect(q1?.periodCost).toBe(1_500_000);

    const q2 = computeInitiativePaybackAsOf(data, '2026-Q2', ['2026-Q2']);
    expect(q2?.periodRevenue).toBe(2_000_000);
    expect(q2?.periodCost).toBe(2_000_000);
  });
});

describe('computeInitiativePlanningForecastSeries', () => {
  it('shows full-period forecast per planning quarter, not cumulative initiative quarters', () => {
    const data = {
      '2026-Q2': { budget: 2_000_000, revenueRub: 3_000_000 },
      '2026-Q3': { budget: 1_000_000, revenueRub: 1_500_000 },
      '2026-Q4': { budget: 800_000, revenueRub: 1_000_000 },
    };

    const q2Forecast = computeInitiativePaybackForecastAtPlanningQuarter(
      data,
      ['2026-Q2', '2026-Q3', '2026-Q4'],
      '2026-Q2'
    );
    expect(q2Forecast?.periodRevenue).toBe(5_500_000);
    expect(q2Forecast?.periodCost).toBe(3_800_000);

    const series = computeInitiativePlanningForecastSeries(
      data,
      ['2026-Q2', '2026-Q3', '2026-Q4'],
      { asOfCalendarQuarter: '2026-Q2' }
    );
    expect(series).toHaveLength(2);
    expect(series[0].planningQuarter).toBe('2026-Q1');
    expect(series[1].planningQuarter).toBe('2026-Q2');
    expect(series[1].isCurrentPlanningQuarter).toBe(true);
    expect(series[1].summary.periodRevenue).toBe(5_500_000);
  });

  it('freezes past planning quarter when new saves happen later', () => {
    const data = {
      '2026-Q2': {
        budget: 2_000_000,
        revenueRub: 4_000_000,
        revenueRubHistory: [
          { value: 3_000_000, at: '2026-04-01T10:00:00.000Z', setInQuarter: '2026-Q2' },
          { value: 4_000_000, at: '2026-07-01T10:00:00.000Z', setInQuarter: '2026-Q3' },
        ],
      },
    };

    const q2Frozen = computeInitiativePaybackForecastAtPlanningQuarter(
      data,
      ['2026-Q2'],
      '2026-Q2'
    );
    expect(q2Frozen?.periodRevenue).toBe(3_000_000);

    const q3Live = computeInitiativePaybackForecastAtPlanningQuarter(
      data,
      ['2026-Q2'],
      '2026-Q3',
      { isLivePlanningQuarter: true }
    );
    expect(q3Live?.periodRevenue).toBe(4_000_000);
  });

  it('breaks down forecast by initiative quarter', () => {
    const breakdown = computePlanningForecastBreakdown(
      {
        '2026-Q2': { budget: 2_000_000, revenueRub: 3_000_000 },
        '2026-Q4': { budget: 800_000, revenueRub: 1_000_000 },
      },
      ['2026-Q2', '2026-Q4'],
      '2026-Q2'
    );
    expect(breakdown?.lines).toHaveLength(2);
    expect(breakdown?.summary.periodCost).toBe(2_800_000);
    expect(breakdown?.summary.periodRevenue).toBe(4_000_000);
  });
});

describe('formatPaybackRatio', () => {
  it('formats compact multiplier', () => {
    expect(formatPaybackRatio(1.666)).toBe('×1.67');
    expect(formatPaybackRatio(12.34)).toBe('×12.3');
  });
});

describe('formatPaybackVsAmounts', () => {
  it('formats millions pair', () => {
    expect(formatPaybackVsAmounts(3_900_000, 6_000_000)).toBe('3.9 млн vs 6 млн');
  });
});

describe('payback tooltip copy', () => {
  const ytd = {
    periodRevenue: 2_000_000,
    periodCost: 2_600_000,
    ratio: 2_000_000 / 2_600_000,
    isPaidOff: false,
  };

  it('formats return percent and lines like mockup', () => {
    expect(formatPaybackReturnPercent(ytd)).toBe(76);
    expect(formatPaybackEffectCostLine(ytd.periodRevenue, ytd.periodCost)).toBe(
      '2 млн ₽ эффекта при 2.6 млн ₽ затрат'
    );
    expect(formatPaybackNetLine(ytd.periodRevenue, ytd.periodCost)).toBe('–0.6 млн ₽');
  });
});
