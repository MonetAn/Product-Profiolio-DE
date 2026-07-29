import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronDown,
  MessageSquareText,
  Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
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
import { useToast } from '@/hooks/use-toast';
import { useAllocationNotificationPreferences } from '@/hooks/useAllocationNotificationPreferences';
import type { AllocationNotificationTeamPair } from '@/lib/allocationNotificationPreferences';

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
      return `${actor} отметил комментарий решённым`;
    case 'comment_reopened':
      return `${actor} вернул комментарий в работу`;
    case 'comment_created':
    default:
      return `${actor} оставил комментарий`;
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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'notifications' | 'settings'>(
    'notifications'
  );
  const [draftAllScopes, setDraftAllScopes] = useState(true);
  const [draftSelectedUnits, setDraftSelectedUnits] = useState<string[]>([]);
  const [draftSelectedTeamPairs, setDraftSelectedTeamPairs] = useState<
    AllocationNotificationTeamPair[]
  >([]);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const { canAccess, accessLoading } = useAccess();
  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    isMarkingAll,
  } = useAllocationNotifications(canAccess && !accessLoading);
  const {
    preferences,
    scopeOptions,
    isAvailable: preferencesAvailable,
    isLoading: preferencesLoading,
    savePreferences,
    isSaving: isSavingPreferences,
  } = useAllocationNotificationPreferences(canAccess && !accessLoading);
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

  const openSettings = () => {
    setDraftAllScopes(preferences.allScopes);
    setDraftSelectedUnits(preferences.selectedUnits);
    setDraftSelectedTeamPairs(preferences.selectedTeamPairs);
    setExpandedUnits(
      new Set([
        ...preferences.selectedUnits,
        ...preferences.selectedTeamPairs.map((pair) => pair.unit),
      ])
    );
    setView('settings');
  };

  const toggleUnit = (unit: string) => {
    setDraftSelectedUnits((current) =>
      current.includes(unit)
        ? current.filter((value) => value !== unit)
        : [...current, unit]
    );
    setDraftSelectedTeamPairs((current) =>
      current.filter((pair) => pair.unit !== unit)
    );
  };

  const toggleTeam = (unit: string, team: string) => {
    setDraftSelectedUnits((current) =>
      current.filter((value) => value !== unit)
    );
    setDraftSelectedTeamPairs((current) => {
      const exists = current.some(
        (pair) => pair.unit === unit && pair.team === team
      );
      return exists
        ? current.filter(
            (pair) => pair.unit !== unit || pair.team !== team
          )
        : [...current, { unit, team }];
    });
  };

  const saveSettings = async () => {
    try {
      await savePreferences({
        allScopes: draftAllScopes,
        selectedUnits: draftSelectedUnits,
        selectedTeamPairs: draftSelectedTeamPairs,
      });
      toast({ title: 'Настройки уведомлений сохранены' });
      setView('notifications');
    } catch (error) {
      toast({
        title: 'Не удалось сохранить настройки',
        description:
          error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  const customSelectionEmpty =
    !draftAllScopes &&
    draftSelectedUnits.length === 0 &&
    draftSelectedTeamPairs.length === 0;

  if (!canAccess || accessLoading) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setView('notifications');
      }}
    >
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
        className="w-[min(94vw,420px)] p-0"
      >
        {view === 'settings' ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Вернуться к уведомлениям"
                onClick={() => setView('notifications')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Настройки уведомлений</p>
                <p className="text-[11px] text-muted-foreground">
                  Выберите, откуда получать новые события
                </p>
              </div>
            </div>

            {preferencesLoading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Загружаем настройки…
              </p>
            ) : !preferencesAvailable ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium">
                  Настройки пока не подключены
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Сначала примените миграцию базы данных. До этого действует
                  подписка на все уведомления.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 px-3.5 py-3">
                  <RadioGroup
                    value={draftAllScopes ? 'all' : 'custom'}
                    onValueChange={(value) =>
                      setDraftAllScopes(value === 'all')
                    }
                    className="gap-2"
                  >
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/40">
                      <RadioGroupItem value="all" className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">
                          Все юниты и команды
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                          Включено по умолчанию для каждого пользователя
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/40">
                      <RadioGroupItem value="custom" className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">
                          Только выбранные
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                          Можно выбрать юнит целиком или отдельные команды
                        </span>
                      </span>
                    </label>
                  </RadioGroup>

                  {!draftAllScopes ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Юниты и команды
                      </p>
                      <ScrollArea className="max-h-[min(48vh,330px)] pr-3">
                        <div className="space-y-1.5">
                          {scopeOptions.map((option) => {
                            const unitSelected =
                              draftSelectedUnits.includes(option.unit);
                            const selectedTeamCount =
                              draftSelectedTeamPairs.filter(
                                (pair) => pair.unit === option.unit
                              ).length;
                            const expanded = expandedUnits.has(option.unit);
                            return (
                              <div
                                key={option.unit}
                                className="overflow-hidden rounded-lg border border-border"
                              >
                                <div className="flex items-center gap-1 px-2 py-1.5">
                                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1">
                                    <Checkbox
                                      checked={unitSelected}
                                      onCheckedChange={() =>
                                        toggleUnit(option.unit)
                                      }
                                    />
                                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                      {option.unit}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                      {unitSelected
                                        ? 'весь юнит'
                                        : selectedTeamCount > 0
                                          ? `${selectedTeamCount} выбрано`
                                          : `${option.teams.length} команд`}
                                    </span>
                                  </label>
                                  {option.teams.length > 0 ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0"
                                      aria-label={
                                        expanded
                                          ? `Свернуть команды ${option.unit}`
                                          : `Показать команды ${option.unit}`
                                      }
                                      onClick={() =>
                                        setExpandedUnits((current) => {
                                          const next = new Set(current);
                                          if (next.has(option.unit)) {
                                            next.delete(option.unit);
                                          } else {
                                            next.add(option.unit);
                                          }
                                          return next;
                                        })
                                      }
                                    >
                                      <ChevronDown
                                        className={cn(
                                          'h-3.5 w-3.5 transition-transform',
                                          !expanded && '-rotate-90'
                                        )}
                                      />
                                    </Button>
                                  ) : null}
                                </div>
                                {expanded && !unitSelected ? (
                                  <div className="space-y-0.5 border-t border-border/70 bg-muted/20 px-2 py-1.5">
                                    {option.teams.map((team) => {
                                      const checked =
                                        draftSelectedTeamPairs.some(
                                          (pair) =>
                                            pair.unit === option.unit &&
                                            pair.team === team
                                        );
                                      return (
                                        <label
                                          key={team}
                                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={() =>
                                              toggleTeam(option.unit, team)
                                            }
                                          />
                                          <span className="min-w-0 flex-1 truncate">
                                            {team}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      {customSelectionEmpty ? (
                        <p className="text-[11px] text-amber-700">
                          Выберите хотя бы один юнит или команду.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                      Вы будете получать новые комментарии, ответы и изменения
                      статуса из всех юнитов и команд.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-3.5 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setView('notifications')}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={customSelectionEmpty || isSavingPreferences}
                    onClick={() => void saveSettings()}
                  >
                    Сохранить
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-3">
              <div>
                <p className="text-sm font-semibold">Уведомления</p>
                <p className="text-[11px] text-muted-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} непрочитанных`
                    : 'Новых уведомлений нет'}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Настроить уведомления"
                  title="Настроить уведомления"
                  disabled={preferencesLoading}
                  onClick={openSettings}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
                  <p className="max-w-[280px] text-xs text-muted-foreground">
                    Здесь появятся комментарии, ответы и изменения статуса из
                    выбранных вами юнитов и команд.
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
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
