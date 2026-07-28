import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserCommentAuthor } from '@/lib/authDisplayName';

export type InitiativeAllocationCommentReply = {
  id: string;
  commentId: string;
  body: string;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  isUnread: boolean;
};

export type InitiativeAllocationComment = {
  id: string;
  scopeType: LocationAllocationCommentScope['type'];
  initiativeId: string | null;
  scopeUnit: string | null;
  scopeTeam: string | null;
  body: string;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  status: 'open' | 'resolved';
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolvedByEmail: string | null;
  isUnread: boolean;
  events: InitiativeAllocationCommentEvent[];
  replies: InitiativeAllocationCommentReply[];
};

export type InitiativeAllocationCommentEvent = {
  id: string;
  type: 'resolved' | 'reopened';
  actorName: string;
  actorEmail: string;
  createdAt: string;
};

export type LocationAllocationCommentScope =
  | { type: 'initiative'; initiativeId: string }
  | { type: 'team'; unit: string; team: string }
  | { type: 'unit'; unit: string };

export type AllocationCommentReadSelection = {
  commentIds: string[];
  replyIds: string[];
};

// Новые таблицы появятся после миграции, поэтому клиент до регенерации типов untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function scopeKey(scope: LocationAllocationCommentScope | null): string {
  if (!scope) return '';
  if (scope.type === 'initiative') return `initiative:${scope.initiativeId}`;
  if (scope.type === 'team') return `team:${scope.unit}\t${scope.team}`;
  return `unit:${scope.unit}`;
}

function queryKey(scope: LocationAllocationCommentScope | null) {
  return ['location-allocation-comments', scopeKey(scope)] as const;
}

type ScopeFilterBuilder = {
  eq: (column: string, value: unknown) => ScopeFilterBuilder;
  is: (column: string, value: null) => ScopeFilterBuilder;
  order: (
    column: string,
    options: { ascending: boolean }
  ) => Promise<{
    data: Record<string, unknown>[] | null;
    error: { code?: string } | null;
  }>;
};

function applyScopeFilter(
  request: ScopeFilterBuilder,
  scope: LocationAllocationCommentScope
) {
  const scoped = request.eq('scope_type', scope.type);
  if (scope.type === 'initiative') {
    return scoped.eq('initiative_id', scope.initiativeId);
  }
  if (scope.type === 'team') {
    return scoped.eq('scope_unit', scope.unit).eq('scope_team', scope.team);
  }
  return scoped.eq('scope_unit', scope.unit).is('scope_team', null);
}

function scopeInsert(scope: LocationAllocationCommentScope) {
  if (scope.type === 'initiative') {
    return {
      scope_type: scope.type,
      initiative_id: scope.initiativeId,
      scope_unit: null,
      scope_team: null,
    };
  }
  if (scope.type === 'team') {
    return {
      scope_type: scope.type,
      initiative_id: null,
      scope_unit: scope.unit,
      scope_team: scope.team,
    };
  }
  return {
    scope_type: scope.type,
    initiative_id: null,
    scope_unit: scope.unit,
    scope_team: null,
  };
}

function isMissingTableError(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function isUnread(updatedAt: string, readAt?: string): boolean {
  if (!readAt) return true;
  return new Date(readAt).getTime() < new Date(updatedAt).getTime();
}

export function useInitiativeAllocationComments(
  scope: LocationAllocationCommentScope | null,
  enabled = true
) {
  const queryClient = useQueryClient();
  const currentScopeKey = scopeKey(scope);
  const invalidateCommentQueries = () => {
    if (scope) {
      queryClient.invalidateQueries({ queryKey: queryKey(scope) });
    }
    queryClient.invalidateQueries({
      queryKey: ['location-allocation-comment-summary'],
    });
  };

  const currentUserQuery = useQuery({
    queryKey: ['location-allocation-comment-current-user'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!enabled || !currentScopeKey) return;
    void queryClient.invalidateQueries({
      queryKey: ['location-allocation-comment-summary'],
    });
  }, [currentScopeKey, enabled, queryClient]);

  const query = useQuery({
    queryKey: queryKey(scope),
    enabled: Boolean(scope && enabled),
    queryFn: async (): Promise<InitiativeAllocationComment[]> => {
      if (!scope) return [];
      const request = sb
        .from('initiative_allocation_comments')
        .select(
          'id, scope_type, initiative_id, scope_unit, scope_team, body, author_user_id, author_name, author_email, created_at, updated_at, status, resolved_at, resolved_by_name, resolved_by_email'
        ) as ScopeFilterBuilder;
      const { data, error } = await applyScopeFilter(request, scope).order(
        'created_at',
        { ascending: false }
      );
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }

      const rows = data ?? [];
      const commentIds = rows.map((row) => String(row.id));
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const [eventResult, commentReadResult, replyResult] =
        commentIds.length > 0
          ? await Promise.all([
              sb
                .from('initiative_allocation_comment_events')
                .select(
                  'id, comment_id, event_type, actor_name, actor_email, created_at'
                )
                .in('comment_id', commentIds)
                .order('created_at', { ascending: false }),
              userId
                ? sb
                    .from('initiative_allocation_comment_reads')
                    .select('comment_id, read_at')
                    .eq('user_id', userId)
                    .in('comment_id', commentIds)
                : Promise.resolve({ data: [], error: null }),
              sb
                .from('initiative_allocation_comment_replies')
                .select(
                  'id, comment_id, body, author_user_id, author_name, author_email, created_at, updated_at'
                )
                .in('comment_id', commentIds)
                .order('created_at', { ascending: true }),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
            ];

      if (eventResult.error) throw eventResult.error;
      if (commentReadResult.error) throw commentReadResult.error;
      if (replyResult.error && !isMissingTableError(replyResult.error)) {
        throw replyResult.error;
      }

      const replyRows = (replyResult.data ?? []) as Record<string, unknown>[];
      const replyIds = replyRows.map((row) => String(row.id));
      const replyReadResult =
        userId && replyIds.length > 0
          ? await sb
              .from('initiative_allocation_comment_reply_reads')
              .select('reply_id, read_at')
              .eq('user_id', userId)
              .in('reply_id', replyIds)
          : { data: [], error: null };
      if (
        replyReadResult.error &&
        !isMissingTableError(replyReadResult.error)
      ) {
        throw replyReadResult.error;
      }

      const eventsByComment = new Map<
        string,
        InitiativeAllocationCommentEvent[]
      >();
      for (const event of eventResult.data ?? []) {
        const commentId = String(event.comment_id);
        const bucket = eventsByComment.get(commentId) ?? [];
        bucket.push({
          id: String(event.id),
          type: String(
            event.event_type
          ) as InitiativeAllocationCommentEvent['type'],
          actorName: String(event.actor_name ?? event.actor_email ?? ''),
          actorEmail: String(event.actor_email ?? ''),
          createdAt: String(event.created_at ?? ''),
        });
        eventsByComment.set(commentId, bucket);
      }

      const readAtByComment = new Map(
        (commentReadResult.data ?? []).map(
          (read: Record<string, unknown>) => [
            String(read.comment_id),
            String(read.read_at ?? ''),
          ]
        )
      );
      const readAtByReply = new Map(
        (replyReadResult.data ?? []).map((read: Record<string, unknown>) => [
          String(read.reply_id),
          String(read.read_at ?? ''),
        ])
      );
      const repliesByComment = new Map<
        string,
        InitiativeAllocationCommentReply[]
      >();
      for (const row of replyRows) {
        const id = String(row.id);
        const commentId = String(row.comment_id);
        const updatedAt = String(row.updated_at ?? row.created_at ?? '');
        const bucket = repliesByComment.get(commentId) ?? [];
        bucket.push({
          id,
          commentId,
          body: String(row.body ?? ''),
          authorUserId: row.author_user_id
            ? String(row.author_user_id)
            : null,
          authorName: String(row.author_name ?? row.author_email ?? ''),
          authorEmail: String(row.author_email ?? ''),
          createdAt: String(row.created_at ?? ''),
          updatedAt,
          isUnread: isUnread(updatedAt, readAtByReply.get(id)),
        });
        repliesByComment.set(commentId, bucket);
      }

      return rows.map((row: Record<string, unknown>) => {
        const id = String(row.id);
        const updatedAt = String(row.updated_at ?? row.created_at ?? '');
        return {
          id,
          scopeType: String(
            row.scope_type
          ) as LocationAllocationCommentScope['type'],
          initiativeId: row.initiative_id
            ? String(row.initiative_id)
            : null,
          scopeUnit: row.scope_unit ? String(row.scope_unit) : null,
          scopeTeam: row.scope_team ? String(row.scope_team) : null,
          body: String(row.body ?? ''),
          authorUserId: row.author_user_id
            ? String(row.author_user_id)
            : null,
          authorName: String(row.author_name ?? row.author_email ?? ''),
          authorEmail: String(row.author_email ?? ''),
          createdAt: String(row.created_at ?? ''),
          updatedAt,
          status: row.status === 'resolved' ? 'resolved' : 'open',
          resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
          resolvedByName: row.resolved_by_name
            ? String(row.resolved_by_name)
            : null,
          resolvedByEmail: row.resolved_by_email
            ? String(row.resolved_by_email)
            : null,
          isUnread: isUnread(updatedAt, readAtByComment.get(id)),
          events: eventsByComment.get(id) ?? [],
          replies: repliesByComment.get(id) ?? [],
        };
      });
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const addMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!scope || !body.trim()) return;
      const author = await getCurrentUserCommentAuthor();
      const { error } = await sb.from('initiative_allocation_comments').insert({
        ...scopeInsert(scope),
        body: body.trim(),
        author_user_id: author.id,
        author_name: author.name,
        author_email: author.email,
      });
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      if (!scope || !body.trim()) return;
      const { error } = await sb
        .from('initiative_allocation_comments')
        .update({ body: body.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!scope) return;
      const { error } = await sb
        .from('initiative_allocation_comments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const addReplyMutation = useMutation({
    mutationFn: async ({
      commentId,
      body,
    }: {
      commentId: string;
      body: string;
    }) => {
      if (!scope || !body.trim()) return;
      const author = await getCurrentUserCommentAuthor();
      const { error } = await sb
        .from('initiative_allocation_comment_replies')
        .insert({
          comment_id: commentId,
          body: body.trim(),
          author_user_id: author.id,
          author_name: author.name,
          author_email: author.email,
        });
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const updateReplyMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      if (!scope || !body.trim()) return;
      const { error } = await sb
        .from('initiative_allocation_comment_replies')
        .update({ body: body.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!scope) return;
      const { error } = await sb
        .from('initiative_allocation_comment_replies')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'open' | 'resolved';
    }) => {
      const { error } = await sb.rpc(
        'set_initiative_allocation_comment_status',
        {
          p_comment_id: id,
          p_status: status,
        }
      );
      if (error) throw error;
    },
    onSuccess: invalidateCommentQueries,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({
      commentIds,
      replyIds,
    }: AllocationCommentReadSelection) => {
      if (commentIds.length === 0 && replyIds.length === 0) return;
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      const readAt = new Date().toISOString();

      const [commentResult, replyResult] = await Promise.all([
        commentIds.length > 0
          ? sb.from('initiative_allocation_comment_reads').upsert(
              commentIds.map((commentId) => ({
                comment_id: commentId,
                user_id: userId,
                read_at: readAt,
              })),
              { onConflict: 'comment_id,user_id' }
            )
          : Promise.resolve({ error: null }),
        replyIds.length > 0
          ? sb.from('initiative_allocation_comment_reply_reads').upsert(
              replyIds.map((replyId) => ({
                reply_id: replyId,
                user_id: userId,
                read_at: readAt,
              })),
              { onConflict: 'reply_id,user_id' }
            )
          : Promise.resolve({ error: null }),
      ]);

      if (commentResult.error) throw commentResult.error;
      if (replyResult.error) throw replyResult.error;
    },
    onSuccess: invalidateCommentQueries,
  });

  return {
    ...query,
    currentUserId: currentUserQuery.data ?? null,
    addComment: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    addError: addMutation.error,
    updateComment: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteComment: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    addReply: addReplyMutation.mutateAsync,
    isAddingReply: addReplyMutation.isPending,
    updateReply: updateReplyMutation.mutateAsync,
    isUpdatingReply: updateReplyMutation.isPending,
    deleteReply: deleteReplyMutation.mutateAsync,
    isDeletingReply: deleteReplyMutation.isPending,
    setCommentStatus: statusMutation.mutateAsync,
    isSettingStatus: statusMutation.isPending,
    markMessagesRead: markReadMutation.mutateAsync,
    isMarkingRead: markReadMutation.isPending,
  };
}
