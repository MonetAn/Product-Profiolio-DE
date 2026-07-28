import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  buildLocationAllocationCommentSummary,
  type LocationAllocationCommentSummary,
  type LocationAllocationSummaryComment,
} from '@/lib/locationAllocationCommentSummary';

// Таблицы комментариев пока не входят в сгенерированные типы Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const EMPTY_SUMMARY: LocationAllocationCommentSummary = {
  byInitiative: new Map(),
  byTeam: new Map(),
  byUnit: new Map(),
};

function isMissingTableError(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function unreadAfter(
  updatedAt: unknown,
  readAt: number | undefined
): boolean {
  const updatedAtMs = new Date(String(updatedAt ?? '')).getTime();
  return readAt == null || readAt < updatedAtMs;
}

export function useLocationAllocationCommentSummary(
  initiatives: AdminDataRow[],
  { enabled = true }: { enabled?: boolean } = {}
) {
  const initiativeIndexKey = useMemo(
    () =>
      initiatives
        .map((row) => `${row.id}\t${row.unit}\t${row.team}`)
        .sort()
        .join('\n'),
    [initiatives]
  );

  return useQuery({
    queryKey: [
      'location-allocation-comment-summary',
      'live-v3',
      initiativeIndexKey,
    ],
    enabled,
    queryFn: async (): Promise<LocationAllocationCommentSummary> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const { data, error } = await sb
        .from('initiative_allocation_comments')
        .select(
          'id, scope_type, initiative_id, scope_unit, scope_team, status, updated_at'
        );

      if (error) {
        if (isMissingTableError(error)) return EMPTY_SUMMARY;
        throw error;
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      const commentIds = rows.map((row) => String(row.id));
      const [commentReadResult, replyResult] =
        commentIds.length > 0
          ? await Promise.all([
              userId
                ? sb
                    .from('initiative_allocation_comment_reads')
                    .select('comment_id, read_at')
                    .eq('user_id', userId)
                    .in('comment_id', commentIds)
                : Promise.resolve({ data: [], error: null }),
              sb
                .from('initiative_allocation_comment_replies')
                .select('id, comment_id, updated_at')
                .in('comment_id', commentIds),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
            ];

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

      const readAtByComment = new Map(
        (commentReadResult.data ?? []).map(
          (read: Record<string, unknown>) => [
            String(read.comment_id),
            new Date(String(read.read_at ?? '')).getTime(),
          ]
        )
      );
      const readAtByReply = new Map(
        (replyReadResult.data ?? []).map(
          (read: Record<string, unknown>) => [
            String(read.reply_id),
            new Date(String(read.read_at ?? '')).getTime(),
          ]
        )
      );
      const unreadRepliesByComment = new Map<string, number>();
      for (const reply of replyRows) {
        const replyId = String(reply.id);
        if (!unreadAfter(reply.updated_at, readAtByReply.get(replyId))) {
          continue;
        }
        const commentId = String(reply.comment_id);
        unreadRepliesByComment.set(
          commentId,
          (unreadRepliesByComment.get(commentId) ?? 0) + 1
        );
      }

      const comments: LocationAllocationSummaryComment[] = rows.map((row) => {
        const id = String(row.id);
        const rootUnread = unreadAfter(
          row.updated_at,
          readAtByComment.get(id)
        );
        return {
          id,
          scopeType: String(
            row.scope_type
          ) as LocationAllocationSummaryComment['scopeType'],
          initiativeId: row.initiative_id
            ? String(row.initiative_id)
            : null,
          scopeUnit: row.scope_unit ? String(row.scope_unit) : null,
          scopeTeam: row.scope_team ? String(row.scope_team) : null,
          isOpen: row.status !== 'resolved',
          unreadCount:
            (rootUnread ? 1 : 0) + (unreadRepliesByComment.get(id) ?? 0),
        };
      });

      return buildLocationAllocationCommentSummary(comments, initiatives);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
