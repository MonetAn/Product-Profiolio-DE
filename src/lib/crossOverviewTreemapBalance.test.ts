import { describe, expect, it } from 'vitest';
import { balanceCrossOverviewTreemapValues } from '@/lib/crossOverviewTreemapBalance';
import type { TreeNode } from '@/lib/dataManager';

describe('balanceCrossOverviewTreemapValues', () => {
  it('raises small initiative so it stays visible next to a large one', () => {
    const root: TreeNode = {
      name: 'Root',
      children: [
        {
          name: 'Cross',
          isCrossInitiative: true,
          value: 448001,
          children: [
            {
              name: 'U',
              isUnit: true,
              value: 448001,
              children: [
                {
                  name: 'Big team',
                  isTeam: true,
                  value: 448000,
                  children: [{ name: 'Big', isInitiative: true, value: 448000 }],
                },
                {
                  name: 'Small team',
                  isTeam: true,
                  value: 1,
                  children: [{ name: 'Small', isInitiative: true, value: 1, displayBudget: 0 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const out = balanceCrossOverviewTreemapValues(root);
    const unit = out.children?.[0]?.children?.[0];
    const teams = unit?.children ?? [];
    expect(teams.length).toBe(2);
    const smallTeam = teams.find((t) => t.name === 'Small team');
    expect((smallTeam?.value ?? 0)).toBeGreaterThanOrEqual(448000 * 0.14);
    const smallInit = smallTeam?.children?.[0];
    expect((smallInit?.value ?? 0)).toBeGreaterThanOrEqual(448000 * 0.14 * 0.9);
    expect((smallInit?.displayBudget ?? 0)).toBeGreaterThan(0);
  });
});
