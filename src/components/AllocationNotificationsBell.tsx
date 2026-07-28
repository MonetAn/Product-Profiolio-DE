import { useMemo, useState } from 'react';
import { Bell, CheckCheck, MessageSquareText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  useAllocationNotifications,
  type AllocationNotification,
} from '@/hooks/useAllocationNotifications';
import {
  teamToUrlParam,
  unitToUrlParam,
} from '@/lib/locationRegionModel';
import { cn } from '@/lib/utils';
import { useAccess } from '@/hooks/useAccess';

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function notificationTitle(item: AllocationNotification): string {
  const actor = item.actorName || item.actorEmail;
  switch (item.eventType) {
    case 'reply_created':
      return `${actor} ответил в треде`;
    case 'comment_resolved':
      return `${actor} отметил ваш комментарий решённым`;
    case 'comment_reopened':
      return `${actor} вернул ваш комментарий в работу`;
    case 'comment_created':
    default:
      return `${actor} оставил комментарий в вашем юните`;
  }
}

function scopeLabel(item: AllocationNotification): string {
  if (item.scopeTeam && item.scopeUnit) {
    return `${item.scopeUnit} · ${item.scopeTeam}`;
  }
  return item.scopeUnit ?? 'Аллокации';
}

export function AllocationNotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { canAccess, accessLoading } = useAccess();
  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    isMarkingAll,
  } = useAllocationNotifications(canAccess && !accessLoading);
  const badge = useMemo(
    () => (unreadCount > 99 ? '99+' : String(unreadCount)),
    [unreadCount]
  );

  const openNotification = async (item: AllocationNotification) => {
    setOpen(false);
    if (!item.readAt) {
      void markRead(item.id);
    }
    const params = new URLSearchParams();
    if (item.scopeUnit) {
      params.set('unit', unitToUrlParam(item.scopeUnit));
    }
    if (item.scopeTeam) {
      params.set('team', teamToUrlParam(item.scopeTeam));
    }
    params.set('comment', item.commentId);
    params.set('commentScope', item.scopeType);
    if (item.initiativeId) {
      params.set('initiative', item.initiativeId);
    }
    navigate(`/allocations?${params.toString()}`);
  };

  if (!canAccess || accessLoading) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label={
            unreadCount > 0
              ? `Уведомления: ${unreadCount} непрочитанных`
              : 'Уведомления'
          }
          title="Уведомления"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-header">
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(92vw,390px)] p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-3">
          <div>
            <p className="text-sm font-semibold">Уведомления</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} непрочитанных`
                : 'Новых уведомлений нет'}
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              disabled={isMarkingAll}
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Прочитать все
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-[min(65vh,430px)]">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Загружаем…
            </p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">Пока всё спокойно</p>
              <p className="max-w-[260px] text-xs text-muted-foreground">
                Здесь появятся ответы, решения комментариев и сообщения из
                юнитов, которыми вы руководите.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    !item.readAt && 'bg-primary/[0.045]'
                  )}
                  onClick={() => void openNotification(item)}
                >
                  <Avatar className="mt-0.5 h-8 w-8 border border-border">
                    {item.actorAvatarUrl ? (
                      <AvatarImage
                        src={item.actorAvatarUrl}
                        alt=""
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initials(item.actorName || item.actorEmail)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
                        {notificationTitle(item)}
                      </span>
                      {!item.readAt ? (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Не прочитано"
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {scopeLabel(item)} · {formatDate(item.createdAt)}
                    </span>
                    {item.excerpt ? (
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-foreground/70">
                        {item.excerpt}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
