import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationAllocationQuarterPlanFact } from '@/components/admin/location-allocation/LocationAllocationQuarterPlanFact';
import type { AdminDataRow } from '@/lib/adminDataManager';

const initiative = {
  id: 'initiative-1',
  unit: 'Data Office',
  team: 'Analytics',
  initiative: 'Прогноз спроса',
  stakeholdersList: [],
  stakeholders: '',
  description: 'Описание инициативы',
  documentationLink: '',
  quarterlyData: {
    '2026-Q1': {
      cost: 1_000_000,
      otherCosts: 0,
      support: false,
      onTrack: true,
      metricPlan: 'Запустить пилот',
      metricFact: 'Пилот запущен',
      comment: 'Команда подтвердила эффект',
      effortCoefficient: 30,
    },
    '2026-Q2': {
      cost: 1_000_000,
      otherCosts: 0,
      support: false,
      onTrack: true,
      metricPlan: 'Расширить на регионы',
      metricFact: '',
      comment: '',
      effortCoefficient: 30,
    },
  },
} satisfies AdminDataRow;

describe('LocationAllocationQuarterPlanFact', () => {
  it('shows the team plan, fact and comment for every quarter', () => {
    render(
      <LocationAllocationQuarterPlanFact
        initiative={initiative}
        quarters={['2026-Q1', '2026-Q2']}
      />
    );

    expect(screen.getByText('План и факт по кварталам')).toBeInTheDocument();
    expect(screen.getByText('записи команды · 2 из 2')).toBeInTheDocument();
    expect(screen.getByText('2026 · Q1')).toBeInTheDocument();
    expect(screen.getByText('2026 · Q2')).toBeInTheDocument();
    expect(screen.getByText('Запустить пилот')).toBeInTheDocument();
    expect(screen.getByText('Пилот запущен')).toBeInTheDocument();
    expect(
      screen.getByText('Команда подтвердила эффект')
    ).toBeInTheDocument();
    expect(screen.getByText('Расширить на регионы')).toBeInTheDocument();
    expect(screen.getByText('Не заполнен')).toBeInTheDocument();
  });

  it('does not show plan-fact for a timeline stub', () => {
    const { container } = render(
      <LocationAllocationQuarterPlanFact
        initiative={{ ...initiative, isTimelineStub: true }}
        quarters={['2026-Q1']}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
