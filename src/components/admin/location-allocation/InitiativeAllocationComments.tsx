import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useInitiativeAllocationComments,
  type InitiativeAllocationComment,
  type InitiativeAllocationCommentReply,
  type LocationAllocationCommentScope,
} from '@/hooks/useInitiativeAllocationComments';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { useAccess } from '@/hooks/useAccess';
import { cn } from '@/lib/utils';

type Props = {
  scope: LocationAllocationCommentScope;
  legacyNote?: string | null;
  compact?: boolean;
  hideEmptyState?: boolean;
  focusedCommentId?: string | null;
  focusedReplyId?: string | null;
};

type EditingTarget = {
  type: 'comment' | 'reply';
  id: string;
};

type DeletingTarget =
  | {
      type: 'comment';
      message: InitiativeAllocationComment;
    }
  | {
      type: 'reply';
      message: InitiativeAllocationCommentReply;
    };

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function wasMessageEdited(createdAt: string, updatedAt: string): boolean {
  return (
    Boolean(updatedAt) &&
    updatedAt !== createdAt &&
    Math.abs(
      new Date(updatedAt).getTime() - new Date(createdAt).getTime()
    ) > 1000
  );
}

function InlineMessageEditor({
  value,
  isUpdating,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  isUpdating: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-1.5 space-y-1.5">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        disabled={isUpdating}
        className="min-h-[56px] resize-y bg-background text-xs"
        autoFocus
      />
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isUpdating}
          onClick={onCancel}
        >
          <X className="mr-1 h-3 w-3" />
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!value.trim() || isUpdating}
          onClick={onSave}
        >
          {isUpdating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function ReplyCard({
  reply,
  currentUserId,
  canDeleteAnyComment,
  isEditing,
  editingDraft,
  isUpdating,
  onStartEdit,
  onEditingDraftChange,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  isFocused,
}: {
  reply: InitiativeAllocationCommentReply;
  currentUserId: string | null;
  canDeleteAnyComment: boolean;
  isEditing: boolean;
  editingDraft: string;
  isUpdating: boolean;
  onStartEdit: () => void;
  onEditingDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  isFocused: boolean;
}) {
  const isAuthor =
    Boolean(currentUserId) && reply.authorUserId === currentUserId;
  const canDelete = isAuthor || canDeleteAnyComment;

  return (
    <div
      id={`allocation-reply-${reply.id}`}
      className={cn(
        'flex items-start gap-2 rounded-md py-1.5 transition-[background-color,box-shadow] duration-700',
        isFocused && 'bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.65)]'
      )}
    >
      <span className="relative shrink-0">
        <Avatar className="h-5 w-5 border border-border/70">
          {reply.authorAvatarUrl ? (
            <AvatarImage
              src={reply.authorAvatarUrl}
              alt=""
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="text-[8px] font-semibold text-muted-foreground">
            {initials(reply.authorName || reply.authorEmail)}
          </AvatarFallback>
        </Avatar>
        {reply.isUnread ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-background"
            title="Новое сообщение для вас"
          />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="truncate text-[10px] font-semibold text-foreground"
              title={reply.authorEmail}
            >
              {reply.authorName || reply.authorEmail}
            </span>
            <time className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
              {formatCommentDate(reply.createdAt)}
              {wasMessageEdited(reply.createdAt, reply.updatedAt)
                ? ' · изменён'
                : ''}
            </time>
          </div>
          {(isAuthor || canDelete) && !isEditing ? (
            <div className="flex shrink-0 items-center gap-0.5">
              {isAuthor ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Редактировать ответ"
                  title="Редактировать"
                  onClick={onStartEdit}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  aria-label="Удалить ответ"
                  title="Удалить"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {isEditing ? (
          <InlineMessageEditor
            value={editingDraft}
            isUpdating={isUpdating}
            onChange={onEditingDraftChange}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
          />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">
            {reply.body}
          </p>
        )}
      </div>
    </div>
  );
}

type CommentCardProps = {
  comment: InitiativeAllocationComment;
  currentUserId: string | null;
  canDeleteAnyComment: boolean;
  editingTarget: EditingTarget | null;
  editingDraft: string;
  replyingToId: string | null;
  replyDraft: string;
  isUpdatingComment: boolean;
  isUpdatingReply: boolean;
  isAddingReply: boolean;
  isSettingStatus: boolean;
  onStartCommentEdit: () => void;
  onStartReplyEdit: (reply: InitiativeAllocationCommentReply) => void;
  onEditingDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteComment: () => void;
  onDeleteReply: (reply: InitiativeAllocationCommentReply) => void;
  onStatusChange: (status: 'open' | 'resolved') => void;
  onStartReply: () => void;
  onReplyDraftChange: (value: string) => void;
  onCancelReply: () => void;
  onSubmitReply: () => void;
  focusedMessageId: string | null;
};

function CommentCard({
  comment,
  currentUserId,
  canDeleteAnyComment,
  editingTarget,
  editingDraft,
  replyingToId,
  replyDraft,
  isUpdatingComment,
  isUpdatingReply,
  isAddingReply,
  isSettingStatus,
  onStartCommentEdit,
  onStartReplyEdit,
  onEditingDraftChange,
  onCancelEdit,
  onSaveEdit,
  onDeleteComment,
  onDeleteReply,
  onStatusChange,
  onStartReply,
  onReplyDraftChange,
  onCancelReply,
  onSubmitReply,
  focusedMessageId,
}: CommentCardProps) {
  const isAuthor =
    Boolean(currentUserId) && comment.authorUserId === currentUserId;
  const canDelete = isAuthor || canDeleteAnyComment;
  const isResolved = comment.status === 'resolved';
  const isEditingComment =
    editingTarget?.type === 'comment' && editingTarget.id === comment.id;
  const isReplying = replyingToId === comment.id;

  return (
    <article
      id={`allocation-comment-${comment.id}`}
      className={cn(
        'rounded-lg border px-2.5 py-2 transition-[background-color,box-shadow] duration-700',
        isResolved
          ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/15'
          : 'border-border/60 bg-muted/20',
        focusedMessageId === comment.id &&
          'bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.65)]'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="relative shrink-0">
          <Avatar className="h-6 w-6 border border-primary/15">
            {comment.authorAvatarUrl ? (
              <AvatarImage
                src={comment.authorAvatarUrl}
                alt=""
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
              {initials(comment.authorName || comment.authorEmail)}
            </AvatarFallback>
          </Avatar>
          {comment.isUnread ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-background"
              title="Новый комментарий для вас"
            />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className="truncate text-[11px] font-semibold text-foreground"
                title={comment.authorEmail}
              >
                {comment.authorName || comment.authorEmail}
              </span>
              <time className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                {formatCommentDate(comment.createdAt)}
                {wasMessageEdited(comment.createdAt, comment.updatedAt)
                  ? ' · изменён'
                  : ''}
              </time>
              {isResolved ? (
                <span className="text-[9px] font-medium text-emerald-700 dark:text-emerald-400">
                  Решён
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {currentUserId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-6 px-1.5 text-[10px] ${
                    isResolved
                      ? 'text-muted-foreground'
                      : 'text-emerald-700 hover:text-emerald-700 dark:text-emerald-400'
                  }`}
                  disabled={isSettingStatus}
                  title={
                    isResolved ? 'Вернуть в работу' : 'Отметить решённым'
                  }
                  onClick={() =>
                    onStatusChange(isResolved ? 'open' : 'resolved')
                  }
                >
                  {isResolved ? (
                    <RotateCcw className="mr-1 h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  {isResolved ? 'Вернуть' : 'Решить'}
                </Button>
              ) : null}
              {(isAuthor || canDelete) && !isEditingComment ? (
                <>
                  {isAuthor ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Редактировать комментарий"
                      title="Редактировать"
                      onClick={onStartCommentEdit}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      aria-label="Удалить комментарий"
                      title="Удалить"
                      onClick={onDeleteComment}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {isEditingComment ? (
            <InlineMessageEditor
              value={editingDraft}
              isUpdating={isUpdatingComment}
              onChange={onEditingDraftChange}
              onCancel={onCancelEdit}
              onSave={onSaveEdit}
            />
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
              {comment.body}
            </p>
          )}

          {comment.events.length > 0 ? (
            <div className="mt-1.5 space-y-0.5 border-l border-border/70 pl-2">
              {comment.events.map((event) => (
                <p
                  key={event.id}
                  className="text-[9px] text-muted-foreground"
                  title={event.actorEmail}
                >
                  {event.type === 'resolved'
                    ? 'Решил'
                    : 'Вернул в работу'}{' '}
                  {event.actorName || event.actorEmail} ·{' '}
                  {formatCommentDate(event.createdAt)}
                </p>
              ))}
            </div>
          ) : null}

          {comment.replies.length > 0 || currentUserId ? (
            <div className="mt-2 border-l-2 border-primary/15 pl-2.5">
              {comment.replies.length > 0 ? (
                <>
                  <p className="pb-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    Ответы · {comment.replies.length}
                  </p>
                  <div className="divide-y divide-border/40">
                    {comment.replies.map((reply) => (
                      <ReplyCard
                        key={reply.id}
                        reply={reply}
                        currentUserId={currentUserId}
                        canDeleteAnyComment={canDeleteAnyComment}
                        isEditing={
                          editingTarget?.type === 'reply' &&
                          editingTarget.id === reply.id
                        }
                        editingDraft={editingDraft}
                        isUpdating={isUpdatingReply}
                        onStartEdit={() => onStartReplyEdit(reply)}
                        onEditingDraftChange={onEditingDraftChange}
                        onCancelEdit={onCancelEdit}
                        onSaveEdit={onSaveEdit}
                        onDelete={() => onDeleteReply(reply)}
                        isFocused={focusedMessageId === reply.id}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {isReplying ? (
                <div className="space-y-1.5 py-1.5">
                  <Textarea
                    value={replyDraft}
                    onChange={(event) =>
                      onReplyDraftChange(event.target.value)
                    }
                    rows={2}
                    disabled={isAddingReply}
                    placeholder="Ответить в треде"
                    className="min-h-[54px] resize-y bg-background text-xs"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={isAddingReply}
                      onClick={onCancelReply}
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!replyDraft.trim() || isAddingReply}
                      onClick={onSubmitReply}
                    >
                      {isAddingReply ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="mr-1 h-3 w-3" />
                      )}
                      Ответить
                    </Button>
                  </div>
                </div>
              ) : currentUserId ? (
                <button
                  type="button"
                  className="mt-1.5 flex min-h-9 w-full items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/[0.025] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onStartReply}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
                    <MessageSquareText className="h-3 w-3" />
                  </span>
                  <span>Написать ответ…</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function InitiativeAllocationComments({
  scope,
  legacyNote,
  compact = false,
  hideEmptyState = false,
  focusedCommentId = null,
  focusedReplyId = null,
}: Props) {
  const { toast } = useToast();
  const { isSuperAdmin } = useAccess();
  const [draft, setDraft] = useState('');
  const [editingTarget, setEditingTarget] =
    useState<EditingTarget | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [deletingTarget, setDeletingTarget] =
    useState<DeletingTarget | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(
    null
  );
  const {
    data = [],
    isLoading,
    currentUserId,
    addComment,
    isAdding,
    updateComment,
    isUpdating,
    deleteComment,
    isDeleting,
    addReply,
    isAddingReply,
    updateReply,
    isUpdatingReply,
    deleteReply,
    isDeletingReply,
    setCommentStatus,
    isSettingStatus,
    markMessagesRead,
    isMarkingRead,
  } = useInitiativeAllocationComments(scope);

  const legacyBody = legacyNote?.trim() ?? '';
  const showLegacyNote =
    Boolean(legacyBody) &&
    !data.some((comment) => comment.body.trim() === legacyBody);
  const openComments = data.filter((comment) => comment.status === 'open');
  const resolvedComments = data.filter(
    (comment) => comment.status === 'resolved'
  );
  const hasUnreadResolved = resolvedComments.some(
    (comment) =>
      comment.isUnread ||
      comment.replies.some((reply) => reply.isUnread)
  );

  useEffect(() => {
    const commentIds = data
      .filter((comment) => comment.isUnread)
      .map((comment) => comment.id);
    const replyIds = data.flatMap((comment) =>
      comment.replies
        .filter((reply) => reply.isUnread)
        .map((reply) => reply.id)
    );
    if (
      (commentIds.length > 0 || replyIds.length > 0) &&
      !isMarkingRead
    ) {
      void markMessagesRead({ commentIds, replyIds });
    }
  }, [data, isMarkingRead, markMessagesRead]);

  useEffect(() => {
    if (hasUnreadResolved) {
      setShowResolved(true);
    }
  }, [hasUnreadResolved]);

  useEffect(() => {
    if (!focusedCommentId || data.length === 0) return;
    if (
      data.some(
        (comment) =>
          comment.id === focusedCommentId && comment.status === 'resolved'
      )
    ) {
      setShowResolved(true);
    }
    const targetId = focusedReplyId || focusedCommentId;
    const targetPrefix = focusedReplyId
      ? 'allocation-reply'
      : 'allocation-comment';
    setFocusedMessageId(targetId);
    const scrollTimeoutId = window.setTimeout(() => {
      document
        .getElementById(`${targetPrefix}-${targetId}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    const highlightTimeoutId = window.setTimeout(
      () => setFocusedMessageId(null),
      3200
    );
    return () => {
      window.clearTimeout(scrollTimeoutId);
      window.clearTimeout(highlightTimeoutId);
    };
  }, [data, focusedCommentId, focusedReplyId]);

  const submit = async () => {
    if (!draft.trim() || isAdding) return;
    try {
      await addComment(draft);
      setDraft('');
    } catch (error) {
      toast({
        title: 'Не удалось добавить комментарий',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const submitReply = async () => {
    if (!replyingToId || !replyDraft.trim() || isAddingReply) return;
    try {
      await addReply({ commentId: replyingToId, body: replyDraft });
      setReplyingToId(null);
      setReplyDraft('');
    } catch (error) {
      toast({
        title: 'Не удалось отправить ответ',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async () => {
    if (
      !editingTarget ||
      !editingDraft.trim() ||
      isUpdating ||
      isUpdatingReply
    ) {
      return;
    }
    try {
      if (editingTarget.type === 'comment') {
        await updateComment({
          id: editingTarget.id,
          body: editingDraft,
        });
      } else {
        await updateReply({
          id: editingTarget.id,
          body: editingDraft,
        });
      }
      setEditingTarget(null);
      setEditingDraft('');
    } catch (error) {
      toast({
        title:
          editingTarget.type === 'comment'
            ? 'Не удалось изменить комментарий'
            : 'Не удалось изменить ответ',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const removeMessage = async () => {
    if (!deletingTarget || isDeleting || isDeletingReply) return;
    try {
      if (deletingTarget.type === 'comment') {
        await deleteComment(deletingTarget.message.id);
      } else {
        await deleteReply(deletingTarget.message.id);
      }
      if (editingTarget?.id === deletingTarget.message.id) {
        setEditingTarget(null);
        setEditingDraft('');
      }
      if (
        deletingTarget.type === 'comment' &&
        replyingToId === deletingTarget.message.id
      ) {
        setReplyingToId(null);
        setReplyDraft('');
      }
      setDeletingTarget(null);
    } catch (error) {
      toast({
        title:
          deletingTarget.type === 'comment'
            ? 'Не удалось удалить комментарий'
            : 'Не удалось удалить ответ',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const changeStatus = async (
    id: string,
    status: 'open' | 'resolved'
  ) => {
    try {
      await setCommentStatus({ id, status });
    } catch (error) {
      toast({
        title:
          status === 'resolved'
            ? 'Не удалось решить комментарий'
            : 'Не удалось вернуть комментарий в работу',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const cancelEdit = () => {
    setEditingTarget(null);
    setEditingDraft('');
  };

  const renderCard = (comment: InitiativeAllocationComment) => (
    <CommentCard
      key={comment.id}
      comment={comment}
      currentUserId={currentUserId}
      canDeleteAnyComment={isSuperAdmin}
      editingTarget={editingTarget}
      editingDraft={editingDraft}
      replyingToId={replyingToId}
      replyDraft={replyDraft}
      isUpdatingComment={isUpdating}
      isUpdatingReply={isUpdatingReply}
      isAddingReply={isAddingReply}
      isSettingStatus={isSettingStatus}
      onStartCommentEdit={() => {
        setEditingTarget({ type: 'comment', id: comment.id });
        setEditingDraft(comment.body);
      }}
      onStartReplyEdit={(reply) => {
        setEditingTarget({ type: 'reply', id: reply.id });
        setEditingDraft(reply.body);
      }}
      onEditingDraftChange={setEditingDraft}
      onCancelEdit={cancelEdit}
      onSaveEdit={() => void saveEdit()}
      onDeleteComment={() =>
        setDeletingTarget({ type: 'comment', message: comment })
      }
      onDeleteReply={(reply) =>
        setDeletingTarget({ type: 'reply', message: reply })
      }
      onStatusChange={(status) => void changeStatus(comment.id, status)}
      onStartReply={() => {
        setReplyingToId(comment.id);
        setReplyDraft('');
      }}
      onReplyDraftChange={setReplyDraft}
      onCancelReply={() => {
        setReplyingToId(null);
        setReplyDraft('');
      }}
      onSubmitReply={() => void submitReply()}
      focusedMessageId={focusedMessageId}
    />
  );

  return (
    <>
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <MessageSquareText
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden
            />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Комментарии
            </p>
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {openComments.length + (showLegacyNote ? 1 : 0)} на этом уровне
          </span>
        </div>

        <div className="rounded-lg border border-border/70 bg-background p-2.5">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Например: нужно скорректировать доли по рынкам"
            rows={compact ? 2 : 3}
            disabled={isAdding}
            className="min-h-[64px] resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="mt-2 flex justify-end border-t border-border/50 pt-2">
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!draft.trim() || isAdding}
              onClick={() => void submit()}
            >
              {isAdding ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-1 h-3 w-3" aria-hidden />
              )}
              Добавить
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Загрузка истории…
          </div>
        ) : openComments.length > 0 ||
          resolvedComments.length > 0 ||
          showLegacyNote ? (
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-0.5">
            {openComments.map(renderCard)}

            {showLegacyNote ? (
              <article className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Ранее сохранённый комментарий
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    импортирован из старого формата
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                  {legacyBody}
                </p>
              </article>
            ) : null}

            {resolvedComments.length > 0 ? (
              <div className="pt-0.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  onClick={() => setShowResolved((value) => !value)}
                  aria-expanded={showResolved}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      showResolved ? 'rotate-180' : ''
                    }`}
                  />
                  Решённые · {resolvedComments.length}
                </button>
                {showResolved ? (
                  <div className="mt-1.5 space-y-2">
                    {resolvedComments.map(renderCard)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : hideEmptyState ? null : (
          <div className="space-y-1 py-1 text-xs text-muted-foreground">
            <p>
              {scope.type === 'unit'
                ? 'На самом юните комментариев пока нет.'
                : scope.type === 'team'
                  ? 'На самой команде комментариев пока нет.'
                  : 'Комментариев пока нет.'}
            </p>
            {scope.type !== 'initiative' ? (
              <p className="text-[10px] leading-snug">
                Счётчик на тримапе также включает нерешённые комментарии
                дочерних сущностей.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <AlertDialog
        open={deletingTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeletingTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingTarget?.type === 'reply'
                ? 'Удалить ответ?'
                : 'Удалить комментарий?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTarget?.type === 'reply'
                ? 'Ответ и связанные с ним уведомления исчезнут. Это действие нельзя отменить.'
                : 'Комментарий, все ответы и связанные уведомления исчезнут у всех пользователей. Это действие нельзя отменить.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting || isDeletingReply}
              onClick={() => void removeMessage()}
            >
              {isDeleting || isDeletingReply ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
