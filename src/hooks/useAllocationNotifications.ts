import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AllocationNotificationEvent =
  | 'comment_created'
  | 'reply_created'
  | 'comment_resolved'
  | 'comment_reopened';

export type AllocationNotification = {
  id: string;
  eventType: AllocationNotificationEvent;
  commentId: string;
  replyId: string | null;
  actorName: string;
  actorEmail: string;
  actorAvatarUrl: string | null;
  scopeType: 'initiative' | 'team' | 'unit';
  initiativeId: string | null;
  scopeUnit: string | null;
  scopeTeam: string | null;
  excerpt: string;
  createdAt: string;
  readAt: string | null;
};

const QUERY_KEY = ['allocation-notifications'] as const;
// Таблица добавлена отдельной миграцией и пока не входит в сгенерированные типы.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useAllocationNotifications(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async (): Promise<AllocationNotification[]> => {
      const { data, error } = await sb
        .from('allocation_notifications')
        .select(
          'id, event_type, comment_id, reply_id, actor_name, actor_email, actor_avatar_url, scope_type, initiative_id, scope_unit, scope_team, message_excerpt, created_at, read_at'
        )
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        eventType: String(row.event_type) as AllocationNotificationEvent,
        commentId: String(row.comment_id ?? ''),
        replyId: row.reply_id ? String(row.reply_id) : null,
        actorName: String(row.actor_name ?? row.actor_email ?? ''),
        actorEmail: String(row.actor_email ?? ''),
        actorAvatarUrl:
          typeof row.actor_avatar_url === 'string' &&
          row.actor_avatar_url.trim()
            ? row.actor_avatar_url
            : null,
        scopeType: String(row.scope_type) as AllocationNotification['scopeType'],
        initiativeId: row.initiative_id
          ? String(row.initiative_id)
          : null,
        scopeUnit: row.scope_unit ? String(row.scope_unit) : null,
        scopeTeam: row.scope_team ? String(row.scope_team) : null,
        excerpt: String(row.message_excerpt ?? ''),
        createdAt: String(row.created_at ?? ''),
        readAt: row.read_at ? String(row.read_at) : null,
      }));
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: 'always',
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('allocation_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      queryClient.setQueryData<AllocationNotification[]>(
        QUERY_KEY,
        (previous) =>
          (previous ?? []).map((item) =>
            item.id === id
              ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
              : item
          )
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const markManyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const uniqueIds = [...new Set(ids.filter(Boolean))];
      if (uniqueIds.length === 0) return;
      const { error } = await sb
        .from('allocation_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', uniqueIds)
        .is('read_at', null);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const readAt = new Date().toISOString();
      const idSet = new Set(ids);
      queryClient.setQueryData<AllocationNotification[]>(
        QUERY_KEY,
        (previous) =>
          (previous ?? []).map((item) =>
            idSet.has(item.id)
              ? { ...item, readAt: item.readAt ?? readAt }
              : item
          )
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from('allocation_notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const readAt = new Date().toISOString();
      queryClient.setQueryData<AllocationNotification[]>(
        QUERY_KEY,
        (previous) =>
          (previous ?? []).map((item) => ({
            ...item,
            readAt: item.readAt ?? readAt,
          }))
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const notifications = query.data ?? [];
  return {
    ...query,
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
    markRead: markOneMutation.mutateAsync,
    markReadMany: markManyMutation.mutateAsync,
    markAllRead: markAllMutation.mutateAsync,
    isMarkingAll: markAllMutation.isPending,
  };
}
