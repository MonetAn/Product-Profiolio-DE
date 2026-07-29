import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AllocationNotificationsBell } from '@/components/AllocationNotificationsBell';

const { savePreferencesMock } = vi.hoisted(() => ({
  savePreferencesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useAccess', () => ({
  useAccess: () => ({ canAccess: true, accessLoading: false }),
}));

vi.mock('@/hooks/useAllocationNotifications', () => ({
  useAllocationNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    isMarkingAll: false,
  }),
}));

vi.mock('@/hooks/useAllocationNotificationPreferences', () => ({
  useAllocationNotificationPreferences: () => ({
    preferences: {
      allScopes: true,
      selectedUnits: [],
      selectedTeamPairs: [],
    },
    scopeOptions: [
      {
        unit: 'Data Office',
        teams: ['Analytics', 'Core Data'],
      },
    ],
    isAvailable: true,
    isLoading: false,
    savePreferences: savePreferencesMock,
    isSaving: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('AllocationNotificationsBell', () => {
  it('saves a custom unit subscription from the bell settings', async () => {
    render(
      <MemoryRouter>
        <AllocationNotificationsBell />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Уведомления' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Настроить уведомления' })
    );
    fireEvent.click(screen.getByText('Только выбранные'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(savePreferencesMock).toHaveBeenCalledWith({
        allScopes: false,
        selectedUnits: ['Data Office'],
        selectedTeamPairs: [],
      })
    );
  });
});
