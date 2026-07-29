import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    const onTeamCommentClick = vi.fn();
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
          unitSummaries: new Map([
            [
              'App&Web',
              [
                { label: 'Domestic', value: '114М', percent: 89 },
                { label: 'International', value: '11М', percent: 8 },
                { label: 'Drinkit', value: '4М', percent: 3 },
              ],
            ],
          ]),
          teamSummaries: new Map([
            [
              'App&Web\tTMNT',
              [
                { label: 'Domestic', value: '100М', percent: 88 },
                { label: 'International', value: '10М', percent: 8 },
                { label: 'Drinkit', value: '4М', percent: 3 },
              ],
            ],
          ]),
          teamCommentCounts: new Map([
            ['App&Web\tTMNT', { openCount: 2, unreadCount: 1 }],
          ]),
          onTeamCommentClick,
        }}
      />
    );

    expect(screen.getByText('App&Web')).toBeInTheDocument();
    expect(screen.getByText('TMNT')).toBeInTheDocument();
    expect(screen.getByText('53 чел.')).toBeInTheDocument();
    expect(screen.getByText('1 чел.')).toBeInTheDocument();
    const unitSummary = screen.getByLabelText(
      'Распределение аллокаций юнита App&Web'
    );
    expect(within(unitSummary).getByText('114М')).toBeInTheDocument();
    expect(within(unitSummary).getByText('(89%)')).toBeInTheDocument();
    const teamSummary = screen.getByLabelText(
      'Распределение аллокаций команды TMNT'
    );
    expect(within(teamSummary).getByText('100М')).toBeInTheDocument();
    expect(within(teamSummary).getByText('(88%)')).toBeInTheDocument();
    expect(within(teamSummary).getByText('10М')).toBeInTheDocument();
    expect(within(teamSummary).getByText('(8%)')).toBeInTheDocument();
    expect(within(teamSummary).getByText('4М')).toBeInTheDocument();
    expect(within(teamSummary).getByText('(3%)')).toBeInTheDocument();
    expect(screen.getByText('Техническая стабильность')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: '2 нерешённых комментариев команды TMNT',
      })
    );
    expect(onTeamCommentClick).toHaveBeenCalledWith('App&Web\tTMNT');
  });
});
