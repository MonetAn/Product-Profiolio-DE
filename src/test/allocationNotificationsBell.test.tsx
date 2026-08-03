import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationNotificationsBell } from '@/components/AllocationNotificationsBell';

const {
  savePreferencesMock,
  markReadMock,
  markReadManyMock,
  markAllReadMock,
  deleteCommentMock,
  accessState,
  notificationState,
} = vi.hoisted(() => ({
  savePreferencesMock: vi.fn().mockResolvedValue(undefined),
  markReadMock: vi.fn().mockResolvedValue(undefined),
  markReadManyMock: vi.fn().mockResolvedValue(undefined),
  markAllReadMock: vi.fn().mockResolvedValue(undefined),
  deleteCommentMock: vi.fn().mockResolvedValue(undefined),
  accessState: { isSuperAdmin: true },
  notificationState: { notifications: [] as Record<string, unknown>[] },
}));

vi.mock('@/hooks/useAccess', () => ({
  useAccess: () => ({
    canAccess: true,
    accessLoading: false,
    isSuperAdmin: accessState.isSuperAdmin,
  }),
}));

vi.mock('@/hooks/useAllocationNotifications', () => ({
  useAllocationNotifications: () => ({
    notifications: notificationState.notifications,
    unreadCount: notificationState.notifications.filter(
      (item) => !item.readAt
    ).length,
    isLoading: false,
    markRead: markReadMock,
    markReadMany: markReadManyMock,
    markAllRead: markAllReadMock,
    isMarkingAll: false,
    deleteComment: deleteCommentMock,
    isDeletingComment: false,
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
  let intersectionCallback: IntersectionObserverCallback | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    accessState.isSuperAdmin = true;
    notificationState.notifications = [];
    intersectionCallback = null;
    class IntersectionObserverMock {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [0.65];
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  });

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

  it('marks only notifications visible inside the list as read', async () => {
    notificationState.notifications = [
      {
        id: 'visible-notification',
        eventType: 'comment_created',
        commentId: 'comment-1',
        replyId: null,
        actorName: 'Анна',
        actorEmail: 'anna@example.com',
        actorAvatarUrl: null,
        scopeType: 'team',
        initiativeId: null,
        scopeUnit: 'Data Office',
        scopeTeam: 'Analytics',
        excerpt: 'Видимый комментарий',
        createdAt: '2026-08-03T09:00:00.000Z',
        readAt: null,
      },
      {
        id: 'below-fold-notification',
        eventType: 'comment_created',
        commentId: 'comment-2',
        replyId: null,
        actorName: 'Борис',
        actorEmail: 'boris@example.com',
        actorAvatarUrl: null,
        scopeType: 'team',
        initiativeId: null,
        scopeUnit: 'Data Office',
        scopeTeam: 'Core Data',
        excerpt: 'Комментарий ниже скролла',
        createdAt: '2026-08-03T08:00:00.000Z',
        readAt: null,
      },
    ];

    render(
      <MemoryRouter>
        <AllocationNotificationsBell />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Уведомления: 2/ })
    );

    await waitFor(() => expect(intersectionCallback).not.toBeNull());
    const visible = document.querySelector(
      '[data-notification-id="visible-notification"]'
    ) as Element;
    const belowFold = document.querySelector(
      '[data-notification-id="below-fold-notification"]'
    ) as Element;

    act(() => {
      intersectionCallback?.(
        [
          {
            target: visible,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
          {
            target: belowFold,
            isIntersecting: false,
            intersectionRatio: 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );
    });

    await waitFor(() =>
      expect(markReadManyMock).toHaveBeenCalledWith([
        'visible-notification',
      ])
    );
  });

  it('navigates a reply notification to its exact thread target', async () => {
    notificationState.notifications = [
      {
        id: 'reply-notification',
        eventType: 'reply_created',
        commentId: 'comment-1',
        replyId: 'reply-1',
        actorName: 'Анна',
        actorEmail: 'anna@example.com',
        actorAvatarUrl: null,
        scopeType: 'team',
        initiativeId: null,
        scopeUnit: 'Data Office',
        scopeTeam: 'Core Data',
        excerpt: 'Точный ответ',
        createdAt: '2026-08-03T09:00:00.000Z',
        readAt: null,
      },
    ];

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location">{location.pathname}{location.search}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AllocationNotificationsBell />
        <LocationProbe />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Уведомления: 1/ })
    );
    fireEvent.click(await screen.findByText('Точный ответ'));

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('/allocations?');
      const params = new URLSearchParams(location.split('?')[1]);
      expect(params.get('comment')).toBe('comment-1');
      expect(params.get('reply')).toBe('reply-1');
      expect(params.get('commentScope')).toBe('team');
    });
  });

  it('lets a super admin delete the whole comment from its notification', async () => {
    notificationState.notifications = [
      {
        id: 'stale-notification',
        eventType: 'comment_created',
        commentId: 'stale-comment',
        replyId: null,
        actorName: 'Анна',
        actorEmail: 'anna@example.com',
        actorAvatarUrl: null,
        scopeType: 'initiative',
        initiativeId: 'old-initiative',
        scopeUnit: 'Data Office',
        scopeTeam: 'Data Platform+Core Data',
        excerpt: 'Тестовый комментарий',
        createdAt: '2026-07-29T08:27:05.000Z',
        readAt: null,
      },
    ];

    render(
      <MemoryRouter>
        <AllocationNotificationsBell />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Уведомления: 1/ })
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Удалить комментарий из уведомления',
      })
    );

    expect(
      screen.getByText(/связанные уведомления исчезнут у всех/i)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить у всех' })
    );

    await waitFor(() => {
      expect(deleteCommentMock).toHaveBeenCalledWith('stale-comment');
    });
  });

  it('keeps notification deletion hidden from other users', async () => {
    accessState.isSuperAdmin = false;
    notificationState.notifications = [
      {
        id: 'regular-notification',
        eventType: 'comment_created',
        commentId: 'comment-1',
        replyId: null,
        actorName: 'Анна',
        actorEmail: 'anna@example.com',
        actorAvatarUrl: null,
        scopeType: 'team',
        initiativeId: null,
        scopeUnit: 'Data Office',
        scopeTeam: 'Analytics',
        excerpt: 'Обычный комментарий',
        createdAt: '2026-08-03T09:00:00.000Z',
        readAt: null,
      },
    ];

    render(
      <MemoryRouter>
        <AllocationNotificationsBell />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Уведомления: 1/ })
    );

    expect(
      await screen.findByText('Обычный комментарий')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Удалить комментарий из уведомления',
      })
    ).not.toBeInTheDocument();
  });
});
