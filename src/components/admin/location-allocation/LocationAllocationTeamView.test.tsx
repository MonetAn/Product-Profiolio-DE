import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LocationAllocationScenarioTeam } from '@/hooks/useLocationAllocationScenario';
import { LocationAllocationTeamView } from './LocationAllocationTeamView';

const mocks = vi.hoisted(() => ({
  downloadWorkbook: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/allocationScenarioWorkbook', () => ({
  downloadAllocationScenarioUnitWorkbook: mocks.downloadWorkbook,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'viewer@dodobrands.io' } }),
}));

const team: LocationAllocationScenarioTeam = {
  id: 'data-platform',
  unit: 'Data Office',
  sourceUnit: 'Data Office',
  sourceTeam: 'Data Platform+Core Data',
  name: 'Data Platform',
  description: 'Платформа данных.',
  fot2025Rub: 57_000_000,
  fot2026Rub: 68_000_000,
  peopleCount2025: null,
  peopleCount2026: 9.5,
  fotChangeRub: 11_000_000,
  fotGrowthPercent: 19,
  runPercent: 35,
  runDescription: 'Поддержка платформы.',
  sortOrder: 0,
  isArchived: false,
  updatedByName: 'Martin Grinchevsky',
  updatedAt: '2026-08-05T06:31:38.14852+00:00',
  regions: [
    {
      id: 'domestic',
      teamId: 'data-platform',
      region: 'Domestic Region',
      percent: 10,
      description: 'Domestic',
      sortOrder: 0,
    },
    {
      id: 'international',
      teamId: 'data-platform',
      region: 'International Region',
      percent: 5,
      description: 'International',
      sortOrder: 1,
    },
    {
      id: 'drinkit',
      teamId: 'data-platform',
      region: 'Drink It',
      percent: 10,
      description: 'Drinkit',
      sortOrder: 2,
    },
    {
      id: 'platform',
      teamId: 'data-platform',
      region: 'Platform',
      percent: 40,
      description: 'Platform',
      sortOrder: 3,
    },
  ],
};

vi.mock('@/hooks/useLocationAllocationScenario', () => {
  return {
    useLocationAllocationScenario: () => ({
      teams: [team],
      unitTotals: [
        {
          unit: 'Data Office',
          fot2025Rub: 57_000_000,
          fot2026Rub: 68_000_000,
          fotChangeRub: 11_000_000,
          fotGrowthPercent: 19,
          peopleCount2025: null,
          peopleCount2026: 9.5,
        },
      ],
      isLoading: false,
      isSaving: false,
      error: null,
      updateTeam: vi.fn(),
      archiveTeam: vi.fn(),
      saveTeamCard: vi.fn(),
      reorderTeams: vi.fn(),
      createTeam: vi.fn(),
    }),
  };
});

describe('LocationAllocationTeamView export', () => {
  it('downloads one workbook for the selected unit', () => {
    render(
      <LocationAllocationTeamView
        initiatives={[]}
        readOnly
        selectedUnit="Data Office"
        onSelectedUnitChange={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button', { name: 'Скачать Excel' });
    expect(buttons).toHaveLength(1);
    const [button] = buttons;
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(mocks.downloadWorkbook).toHaveBeenCalledTimes(1);
    expect(mocks.downloadWorkbook).toHaveBeenCalledWith('Data Office', [team]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Excel-файл скачан' })
    );
  });
});
