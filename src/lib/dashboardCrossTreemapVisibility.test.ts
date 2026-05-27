import { describe, expect, it } from 'vitest';
import { resolveDashboardCrossSplitVisibility } from '@/lib/dashboardCrossTreemapVisibility';
import { PORTFOLIO_REST_NODE_NAME } from '@/lib/dashboardCrossTreemapTree';
import type { TreeNode } from '@/lib/dataManager';

function portfolioTree(): TreeNode {
  return {
    name: 'Портфель',
    isRoot: true,
    value: 100,
    children: [
      { name: 'GDPR', isCrossInitiative: true, value: 20, children: [] },
      {
        name: PORTFOLIO_REST_NODE_NAME,
        isPortfolioRest: true,
        value: 80,
        children: [{ name: 'App&Web', isUnit: true, value: 80, children: [] }],
      },
    ],
  };
}

describe('resolveDashboardCrossSplitVisibility', () => {
  const levels = { showUnits: false, showTeams: true, showInitiatives: true };

  it('на сплите: инициативы только слева, кроссы без инициатив', () => {
    const { cross, rest } = resolveDashboardCrossSplitVisibility(
      true,
      [],
      portfolioTree(),
      levels,
      false
    );
    expect(rest.showInitiatives).toBe(true);
    expect(cross.showInitiatives).toBe(false);
  });

  it('флаг «в кроссах» раскрывает инициативы справа', () => {
    const { cross } = resolveDashboardCrossSplitVisibility(
      true,
      [],
      portfolioTree(),
      levels,
      true
    );
    expect(cross.showInitiatives).toBe(true);
  });

  it('без «Остальное»: инициативы в кроссах только через «В кроссах»', () => {
    const { cross, rest } = resolveDashboardCrossSplitVisibility(
      false,
      [],
      portfolioTree(),
      levels,
      false
    );
    expect(cross.showInitiatives).toBe(false);
    expect(rest.showInitiatives).toBe(true);
    const inside = resolveDashboardCrossSplitVisibility(false, [], portfolioTree(), levels, true);
    expect(inside.cross.showInitiatives).toBe(true);
  });

  it('внутри кросса на глубине 1 — юниты без инициатив, если «В кроссах» выкл', () => {
    const { cross } = resolveDashboardCrossSplitVisibility(
      true,
      ['GDPR'],
      portfolioTree(),
      { showUnits: false, showTeams: false, showInitiatives: false },
      false
    );
    expect(cross.showUnits).toBe(true);
    expect(cross.showInitiatives).toBe(false);
  });

  it('внутри команды (глубина 3) — инициативы даже без «В кроссах»', () => {
    const { cross } = resolveDashboardCrossSplitVisibility(
      false,
      ['GDPR', 'U1', 'T1'],
      portfolioTree(),
      { showUnits: true, showTeams: true, showInitiatives: false },
      false
    );
    expect(cross.showInitiatives).toBe(true);
  });
});
