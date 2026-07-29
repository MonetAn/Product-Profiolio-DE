import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InitiativeAllocationComments } from '@/components/admin/location-allocation/InitiativeAllocationComments';

const mocks = vi.hoisted(() => ({
  addReply: vi.fn(),
  markMessagesRead: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useInitiativeAllocationComments', () => ({
  useInitiativeAllocationComments: () => ({
    data: [
      {
        id: 'comment-1',
        scopeType: 'initiative',
        initiativeId: 'initiative-1',
        scopeUnit: null,
        scopeTeam: null,
        body: 'Нужно проверить распределение',
        authorUserId: 'user-1',
        authorName: 'Анна',
        authorEmail: 'anna@example.com',
        authorAvatarUrl: 'https://example.com/anna.jpg',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
        status: 'open',
        resolvedAt: null,
        resolvedByName: null,
        resolvedByEmail: null,
        isUnread: false,
        events: [],
        replies: [
          {
            id: 'reply-1',
            commentId: 'comment-1',
            body: 'Проверил, доли актуальны',
            authorUserId: 'user-2',
            authorName: 'Борис',
            authorEmail: 'boris@example.com',
            authorAvatarUrl: 'https://example.com/boris.jpg',
            createdAt: '2026-07-28T10:05:00.000Z',
            updatedAt: '2026-07-28T10:05:00.000Z',
            isUnread: true,
          },
        ],
      },
    ],
    isLoading: false,
    currentUserId: 'user-2',
    addComment: vi.fn(),
    isAdding: false,
    updateComment: vi.fn(),
    isUpdating: false,
    deleteComment: vi.fn(),
    isDeleting: false,
    addReply: mocks.addReply,
    isAddingReply: false,
    updateReply: vi.fn(),
    isUpdatingReply: false,
    deleteReply: vi.fn(),
    isDeletingReply: false,
    setCommentStatus: vi.fn(),
    isSettingStatus: false,
    markMessagesRead: mocks.markMessagesRead,
    isMarkingRead: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe('InitiativeAllocationComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addReply.mockResolvedValue(undefined);
    mocks.markMessagesRead.mockResolvedValue(undefined);
  });

  it('renders replies as a thread and keeps resolution on the root only', async () => {
    render(
      <InitiativeAllocationComments
        scope={{ type: 'initiative', initiativeId: 'initiative-1' }}
      />
    );

    expect(screen.getByText('Ответы · 1')).toBeInTheDocument();
    expect(screen.getByText('Проверил, доли актуальны')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Решить' })
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Редактировать ответ' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Удалить ответ' })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.markMessagesRead).toHaveBeenCalledWith({
        commentIds: [],
        replyIds: ['reply-1'],
      });
    });
  });

  it('sends a reply into the selected comment thread', async () => {
    render(
      <InitiativeAllocationComments
        scope={{ type: 'initiative', initiativeId: 'initiative-1' }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Написать ответ…' })
    );
    fireEvent.change(screen.getByPlaceholderText('Ответить в треде'), {
      target: { value: 'Добавил уточнение' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));

    await waitFor(() => {
      expect(mocks.addReply).toHaveBeenCalledWith({
        commentId: 'comment-1',
        body: 'Добавил уточнение',
      });
    });
  });
});
