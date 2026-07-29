import { describe, expect, it } from 'vitest';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { locationTeamKey } from '@/lib/locationAllocationPlanning';
import { buildLocationAllocationCommentSummary } from '@/lib/locationAllocationCommentSummary';

const initiative = {
  id: 'initiative-1',
  unit: 'Payments',
  team: 'Checkout',
} as AdminDataRow;

describe('buildLocationAllocationCommentSummary', () => {
  it('propagates initiative and team comments to their parent levels', () => {
    const summary = buildLocationAllocationCommentSummary(
      [
        {
          id: 'comment-1',
          scopeType: 'initiative',
          initiativeId: initiative.id,
          scopeUnit: null,
          scopeTeam: null,
          isOpen: true,
          unreadCount: 1,
        },
        {
          id: 'comment-2',
          scopeType: 'team',
          initiativeId: null,
          scopeUnit: initiative.unit,
          scopeTeam: initiative.team,
          isOpen: true,
          unreadCount: 0,
        },
        {
          id: 'comment-3',
          scopeType: 'unit',
          initiativeId: null,
          scopeUnit: initiative.unit,
          scopeTeam: null,
          isOpen: true,
          unreadCount: 1,
        },
      ],
      [initiative]
    );

    expect(summary.byInitiative.get(initiative.id)).toEqual({
      openCount: 1,
      unreadCount: 1,
    });
    expect(
      summary.byTeam.get(locationTeamKey(initiative.unit, initiative.team))
    ).toEqual({ openCount: 2, unreadCount: 1 });
    expect(
      summary.byTeamDirect.get(
        locationTeamKey(initiative.unit, initiative.team)
      )
    ).toEqual({ openCount: 1, unreadCount: 0 });
    expect(
      summary.byTeamInitiatives.get(
        locationTeamKey(initiative.unit, initiative.team)
      )
    ).toEqual({ openCount: 1, unreadCount: 1 });
    expect(summary.byUnit.get(initiative.unit)).toEqual({
      openCount: 3,
      unreadCount: 2,
    });
  });

  it('notifies about replies without reopening a resolved comment', () => {
    const summary = buildLocationAllocationCommentSummary(
      [
        {
          id: 'resolved-thread',
          scopeType: 'initiative',
          initiativeId: initiative.id,
          scopeUnit: null,
          scopeTeam: null,
          isOpen: false,
          unreadCount: 2,
        },
      ],
      [initiative]
    );

    expect(summary.byInitiative.get(initiative.id)).toEqual({
      openCount: 0,
      unreadCount: 2,
    });
    expect(
      summary.byTeam.get(locationTeamKey(initiative.unit, initiative.team))
    ).toEqual({ openCount: 0, unreadCount: 2 });
    expect(
      summary.byTeamDirect.get(
        locationTeamKey(initiative.unit, initiative.team)
      )
    ).toBeUndefined();
    expect(
      summary.byTeamInitiatives.get(
        locationTeamKey(initiative.unit, initiative.team)
      )
    ).toEqual({ openCount: 0, unreadCount: 2 });
    expect(summary.byUnit.get(initiative.unit)).toEqual({
      openCount: 0,
      unreadCount: 2,
    });
  });
});
