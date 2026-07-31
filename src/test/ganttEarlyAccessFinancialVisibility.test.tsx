import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GanttView from '@/components/GanttView';
import type { RawDataRow } from '@/lib/dataManager';

const financialOnlyRow: RawDataRow = {
  unit: 'Unit A',
  team: 'Team 1',
  initiative: 'Фича с финансовым эффектом',
  description: '',
  stakeholders: '',
  quarterlyData: {
    '2026-Q3': {
      budget: 0,
      support: false,
      onTrack: true,
      metricPlan: '',
      metricFact: '',
      comment: '',
      profitRub: 2_000_000,
      grossRevenueRub: 6_000_000,
    },
  },
};

const renderTimeline = (showInitiativePayback: boolean) =>
  render(
    <GanttView
      rawData={[financialOnlyRow]}
      selectedQuarters={['2026-Q3']}
      supportFilter="all"
      showOnlyOfftrack={false}
      selectedUnits={[]}
      selectedTeams={[]}
      selectedStakeholders={[]}
      showInitiativePayback={showInitiativePayback}
    />
  );

describe('Gantt financial visibility by early access', () => {
  it('hides a financial-only initiative when early access is disabled', () => {
    renderTimeline(false);

    expect(screen.queryByText(financialOnlyRow.initiative)).not.toBeInTheDocument();
    expect(screen.queryByText('П +2.0M')).not.toBeInTheDocument();
  });

  it('shows a financial-only initiative when early access is enabled', () => {
    renderTimeline(true);

    expect(screen.getByText(financialOnlyRow.initiative)).toBeInTheDocument();
    expect(screen.getByText('П +2.0M')).toBeInTheDocument();
  });
});
