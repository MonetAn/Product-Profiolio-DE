import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocationAllocationTreemapNode } from '@/components/admin/location-allocation/LocationAllocationTreemapNode';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { buildLocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import { locationTeamKey } from '@/lib/locationAllocationPlanning';
import type { LocationAllocationCommentSummary } from '@/lib/locationAllocationCommentSummary';

const initiative = {
  id: 'initiative-1',
  unit: 'Core',
  team: 'Platform',
  initiative: 'Checkout',
  stakeholdersList: [],
  description: '',
  documentationLink: '',
  stakeholders: '',
  quarterlyData: {
    '2026-Q1': {
      cost: 1_000_000,
      otherCosts: 0,
      support: false,
      onTrack: true,
      metricPlan: '',
      metricFact: '',
      comment: '',
      effortCoefficient: 10,
    },
  },
} satisfies AdminDataRow;

const initiativeNode = {
  key: 'initiative-1',
  path: 'Core/Platform/Checkout',
  name: 'Checkout',
  data: {
    name: 'Checkout',
    value: 1_000_000,
    unit: 'Core',
    team: 'Platform',
    isInitiative: true,
    adminInitiativeRowId: initiative.id,
    children: [],
  },
  x0: 0,
  y0: 28,
  x1: 300,
  y1: 200,
  width: 300,
  height: 172,
  depth: 1,
  value: 1_000_000,
  color: '#7c3aed',
  isInitiative: true,
} satisfies TreemapLayoutNode;

const teamNode = {
  key: 'team-platform',
  path: 'Core/Platform',
  name: 'Platform',
  data: {
    name: 'Platform',
    value: 1_000_000,
    unit: 'Core',
    team: 'Platform',
    isTeam: true,
    children: [],
  },
  x0: 0,
  y0: 0,
  x1: 300,
  y1: 200,
  width: 300,
  height: 200,
  depth: 0,
  value: 1_000_000,
  color: '#6d28d9',
  isTeam: true,
  children: [initiativeNode],
} satisfies TreemapLayoutNode;

const count = { openCount: 1, unreadCount: 1 };
const teamKey = locationTeamKey(initiative.unit, initiative.team);
const commentSummary: LocationAllocationCommentSummary = {
  byInitiative: new Map([[initiative.id, count]]),
  byTeamDirect: new Map(),
  byTeamInitiatives: new Map([[teamKey, count]]),
  byTeam: new Map([[teamKey, count]]),
  byUnit: new Map([[initiative.unit, count]]),
};
const meta = buildLocationAllocationTreemapMeta(
  [initiative],
  ['2026-Q1'],
  [],
  new Map()
);

describe('LocationAllocationTreemapNode comments', () => {
  it('moves initiative discussions from the team aggregate to concrete initiatives after drill-down', () => {
    const onEditClick = vi.fn();
    const { rerender } = render(
      <LocationAllocationTreemapNode
        node={teamNode}
        meta={meta}
        focusedPath={['Core', 'Platform']}
        isFocusedTeamView
        renderDepth={3}
        onEditClick={onEditClick}
        commentSummary={commentSummary}
      />
    );

    const initiativeDiscussion = screen.getByRole('button', {
      name: /Обсуждение инициативы «Checkout»/,
    });
    expect(
      screen.queryByLabelText(/нерешённых комментариев в инициативах команды/)
    ).not.toBeInTheDocument();
    fireEvent.click(initiativeDiscussion);
    expect(onEditClick).toHaveBeenCalledWith(initiativeNode);

    rerender(
      <LocationAllocationTreemapNode
        node={teamNode}
        meta={meta}
        focusedPath={['Core']}
        isFocusedTeamView={false}
        renderDepth={3}
        onEditClick={onEditClick}
        commentSummary={commentSummary}
      />
    );

    expect(
      screen.queryByRole('button', {
        name: /Обсуждение инициативы «Checkout»/,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/нерешённых комментариев в инициативах команды/)
    ).toBeInTheDocument();
  });
});
