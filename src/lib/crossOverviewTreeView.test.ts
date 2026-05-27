import { describe, expect, it } from 'vitest';
import {
  applyCrossOverviewView,
  crossOverviewRenderDepth,
} from '@/lib/crossOverviewTreeView';
import type { TreeNode } from '@/lib/dataManager';

function sampleCrossTree(): TreeNode {
  return {
    name: 'Root',
    isRoot: true,
    value: 400,
    children: [
      {
        name: 'Cross A',
        isUnit: true,
        isCrossInitiative: true,
        value: 400,
        children: [
          {
            name: 'U1',
            isUnit: true,
            value: 400,
            children: [
              {
                name: 'T1',
                isTeam: true,
                value: 300,
                children: [
                  { name: 'I1', isInitiative: true, value: 100, adminInitiativeRowId: '1' },
                  { name: 'I2', isInitiative: true, value: 200, adminInitiativeRowId: '2' },
                ],
              },
              {
                name: 'T2',
                isTeam: true,
                value: 100,
                children: [
                  { name: 'I3', isInitiative: true, value: 100, adminInitiativeRowId: '3' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('applyCrossOverviewView', () => {
  it('shows only teams without units when requested', () => {
    const view = applyCrossOverviewView(sampleCrossTree(), {
      showUnits: false,
      showTeams: true,
      showInitiatives: false,
    });
    const cross = view.children?.[0];
    expect(cross?.children?.[0]?.isTeam).toBe(true);
    expect(cross?.children?.[0]?.isUnit).toBeFalsy();
    expect(cross?.children?.[0]?.children).toBeUndefined();
  });

  it('shows only initiatives without units or teams', () => {
    const view = applyCrossOverviewView(sampleCrossTree(), {
      showUnits: false,
      showTeams: false,
      showInitiatives: true,
    });
    const cross = view.children?.[0];
    expect(cross?.children?.every((c) => c.isInitiative)).toBe(true);
    expect(cross?.children).toHaveLength(3);
  });

  it('shows initiatives directly under units when teams are off', () => {
    const view = applyCrossOverviewView(sampleCrossTree(), {
      showUnits: true,
      showTeams: false,
      showInitiatives: true,
    });
    const unit = view.children?.[0]?.children?.[0];
    expect(unit?.name).toBe('U1');
    expect(unit?.children?.every((c) => c.isInitiative)).toBe(true);
    expect(unit?.children).toHaveLength(3);
  });

  it('keeps all teams when teams and initiatives are enabled', () => {
    const view = applyCrossOverviewView(sampleCrossTree(), {
      showUnits: false,
      showTeams: true,
      showInitiatives: true,
    });
    const cross = view.children?.[0];
    expect(cross?.children?.filter((c) => c.isTeam)).toHaveLength(2);
    expect(cross?.children?.[0]?.children).toHaveLength(2);
    expect(cross?.children?.[1]?.children).toHaveLength(1);
  });
});

describe('crossOverviewRenderDepth', () => {
  it('allows nested layout for team + initiative under focus', () => {
    const view = applyCrossOverviewView(sampleCrossTree(), {
      showUnits: true,
      showTeams: true,
      showInitiatives: true,
    });
    const unit = view.children?.[0]?.children?.[0];
    expect(unit?.name).toBe('U1');
    const depth = crossOverviewRenderDepth(view, ['Cross A', 'U1']);
    expect(depth).toBeGreaterThanOrEqual(4);
  });
});
