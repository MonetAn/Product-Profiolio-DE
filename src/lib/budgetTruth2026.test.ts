import { describe, expect, it } from 'vitest';
import { defaultPortfolioQuarters2026 } from './budgetTruth2026';

describe('defaultPortfolioQuarters2026', () => {
  it('selects the full year when the active dataset only contains Q1-Q2', () => {
    expect(defaultPortfolioQuarters2026(['2026-Q1', '2026-Q2'])).toEqual([
      '2026-Q1',
      '2026-Q2',
      '2026-Q3',
      '2026-Q4',
    ]);
  });

  it('keeps a non-2026 catalog unchanged', () => {
    expect(defaultPortfolioQuarters2026(['2025-Q3', '2025-Q4'])).toEqual([
      '2025-Q3',
      '2025-Q4',
    ]);
  });
});
