import { describe, expect, it } from 'vitest';
import { budgetRubForDisplay, isDisplayRoundingDustRub } from '@/lib/budgetDisplayRub';
import { formatBudget, formatBudgetShort } from '@/lib/dataManager';

describe('formatBudget', () => {
  it('formats millions and thousands', () => {
    expect(formatBudget(326_500_000)).toBe('326.5 млн ₽');
    expect(formatBudget(12_500)).toBe('13 тыс. ₽');
  });

  it('maps rounding dust to 0 ₽', () => {
    expect(formatBudget(0.8274520460704287)).toBe('0 ₽');
    expect(formatBudget(99)).toBe('0 ₽');
    expect(formatBudget(0)).toBe('0 ₽');
  });

  it('keeps meaningful sub-thousand amounts', () => {
    expect(formatBudget(150)).toBe('150 ₽');
    expect(formatBudget(42.9)).toBe('43 ₽');
  });
});

describe('formatBudgetShort', () => {
  it('maps dust to zero', () => {
    expect(formatBudgetShort(0.8274520460704287)).toBe('0');
    expect(formatBudgetShort(0)).toBe('0');
  });
});

describe('budgetRubForDisplay', () => {
  it('matches dust threshold', () => {
    expect(isDisplayRoundingDustRub(1)).toBe(true);
    expect(budgetRubForDisplay(2)).toBe(0);
    expect(budgetRubForDisplay(150)).toBe(150);
  });
});
