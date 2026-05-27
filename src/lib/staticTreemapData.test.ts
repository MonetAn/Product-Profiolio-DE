import { describe, expect, it } from 'vitest';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';
import type { TreeNode } from '@/lib/dataManager';

describe('prepareStaticTreemapTree', () => {
  it('preserves cross → unit → team → initiative hierarchy', () => {
    const root: TreeNode = {
      name: 'Кросс-инициативы',
      isRoot: true,
      value: 100,
      children: [
        {
          name: 'Кросс A',
          isUnit: true,
          isCrossInitiative: true,
          value: 100,
          children: [
            {
              name: 'Unit 1',
              isUnit: true,
              value: 100,
              children: [
                {
                  name: 'Team 1',
                  isTeam: true,
                  value: 100,
                  children: [
                    { name: 'Init 1', isInitiative: true, value: 100 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const prepared = prepareStaticTreemapTree(root);
    const cross = prepared.children?.[0];
    expect(cross?.isCrossInitiative).toBe(true);
    expect(cross?.children?.[0]?.name).toBe('Unit 1');
    expect(cross?.children?.[0]?.isUnit).toBe(true);
    expect(cross?.children?.[0]?.children?.[0]?.isTeam).toBe(true);
    expect(cross?.children?.[0]?.children?.[0]?.children?.[0]?.isInitiative).toBe(true);
  });

  it('keeps cross tile when inner levels hidden (no children, value on node)', () => {
    const root: TreeNode = {
      name: 'Кросс-инициативы',
      isRoot: true,
      value: 50,
      children: [
        {
          name: 'Тест',
          isUnit: true,
          isCrossInitiative: true,
          crossInitiativeId: 'c1',
          value: 50,
          children: undefined,
        },
      ],
    };

    const prepared = prepareStaticTreemapTree(root);
    expect(prepared.children).toHaveLength(1);
    expect(prepared.children?.[0]?.name).toBe('Тест');
    expect(prepared.children?.[0]?.value).toBe(50);
  });
});
