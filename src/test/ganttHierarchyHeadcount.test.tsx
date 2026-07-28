import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GanttView from '@/components/GanttView';
import type { RawDataRow } from '@/lib/dataManager';

const row: RawDataRow = {
  unit: 'App&Web',
  team: 'TMNT',
  initiative: 'Техническая стабильность',
  description: '',
  stakeholders: '',
  quarterlyData: {
    '2026-Q1': {
      budget: 1_000_000,
      support: false,
      onTrack: true,
      metricPlan: '',
      metricFact: '',
      comment: '',
    },
  },
};

describe('GanttView hierarchy headcount', () => {
  it('shows people once in unit and team headers, not on the initiative', () => {
    render(
      <GanttView
        rawData={[row]}
        selectedQuarters={['2026-Q1']}
        supportFilter="all"
        showOnlyOfftrack={false}
        selectedUnits={[]}
        selectedTeams={[]}
        selectedStakeholders={[]}
        bypassTimelineFilters
        hierarchyGrouping={{
          mode: 'unit-team',
          headcountByUnit: new Map([['App&Web', 53]]),
          headcountByTeam: new Map([['App&Web\tTMNT', 1]]),
        }}
      />
    );

    expect(screen.getByText('App&Web')).toBeInTheDocument();
    expect(screen.getByText('TMNT')).toBeInTheDocument();
    expect(screen.getByText('53 чел.')).toBeInTheDocument();
    expect(screen.getByText('1 чел.')).toBeInTheDocument();
    expect(screen.getByText('Техническая стабильность')).toBeInTheDocument();
  });
});
