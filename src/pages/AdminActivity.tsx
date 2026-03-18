import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Trash2, Loader2, Download, List, Users } from 'lucide-react';
import { subDays, startOfDay, endOfDay, format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type UserFilterMode = 'all' | 'only' | 'exclude';

const PAGE_SIZE = 100;
const EXPORT_LIMIT = 5000;

/** Пороги для подсказки «Рекомендуется удалить часть событий» */
const ACTIVITY_STATS_ROW_THRESHOLD = 100_000;
const ACTIVITY_STATS_SIZE_BYTES_THRESHOLD = 50 * 1024 * 1024; // 50 MB

const PATH_PRESETS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: '/', label: 'Дашборд (/)' },
  { value: '/admin', label: 'Админка (/admin)' },
];

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(220 70% 50%)',
  'hsl(280 65% 50%)',
];

const CHART_TOP_N = 15;

/** Закреплённые email сверху в списке пользователей (например тестовые). */
const PINNED_USER_EMAILS: string[] = [];

/** Тестовые/служебные аккаунты — можно исключить из выборки в «Что делали». */
const TEST_USER_EMAILS: string[] = [];

type ActivityEventRow = Database['public']['Tables']['activity_events']['Row'];

type PeriodPreset = '7' | '30' | 'custom';

const EVENT_TYPE_LABELS: Record<string, string> = {
  page_view: 'Просмотр страницы',
  heartbeat: 'Активность',
  click: 'Клик',
  view_switch: 'Смена вкладки',
  treemap_zoom: 'Тримап: зум',
  treemap_click: 'Тримап: клик по инициативе',
  treemap: 'Тримап (зум/клик)',
};

function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

function formatDateShort(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy HH:mm', { locale: ru });
}

function formatEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

function formatClickPayload(payload: unknown): string {
  if (payload == null || typeof payload !== 'object') return '—';
  const p = payload as Record<string, unknown>;
  const tag = p.tag as string | undefined;
  const text = p.text as string | undefined;
  if (tag && text) return `Элемент ${tag} «${String(text).slice(0, 60)}${(String(text).length > 60 ? '…' : '')}»`;
  if (tag) return `Элемент ${tag}`;
  try {
    const str = JSON.stringify(payload);
    return str.length > 80 ? str.slice(0, 77) + '…' : str;
  } catch {
    return '—';
  }
}

function formatEventSummary(ev: ActivityEventRow): string {
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  const view = (p.view as string) ?? '';
  const path = ev.path ?? '';
  switch (ev.event_type) {
    case 'page_view':
      return `Открыт дашборд портфеля${view ? ` (вкладка ${view})` : ''}${Array.isArray(p.zoomPath) && (p.zoomPath as string[]).length ? `, зум ${(p.zoomPath as string[]).join(' → ')}` : ''}`.trim() || path || 'Просмотр страницы';
    case 'heartbeat':
      return view ? `Пульс активности на вкладке ${view}` : 'Пульс активности';
    case 'view_switch': {
      const from = (p.from as string) ?? '';
      const to = (p.to as string) ?? '';
      return to ? `Перешёл на вкладку ${to}` : `Смена вкладки ${from} → ${to}`;
    }
    case 'treemap_zoom':
      return `Тримап ${view || '?'}: зум в ${(p.path as string) ?? p.name ?? '…'}`;
    case 'treemap_click':
      return `Тримап ${view || '?'}: клик по инициативе «${(p.name as string) ?? (p.path as string) ?? '…'}»`;
    case 'click': {
      const tag = (p.tag as string) ?? '';
      const text = (p.text as string) ?? '';
      const viewLabel = view ? `На вкладке ${view}: ` : '';
      if (tag && text) return `${viewLabel}клик по ${tag} «${String(text).slice(0, 50)}${text.length > 50 ? '…' : ''}»`;
      if (tag) return `${viewLabel}клик по ${tag}`;
      return viewLabel || formatClickPayload(ev.payload);
    }
    default:
      return formatEventType(ev.event_type) + (path ? ` — ${path}` : '');
  }
}

function formatPayloadCell(ev: ActivityEventRow): string {
  if (ev.event_type === 'click') return formatClickPayload(ev.payload);
  if (ev.event_type === 'page_view') return `Просмотр: ${ev.path ?? '—'}`;
  return '—';
}

function getPeriodBounds(preset: PeriodPreset, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  if (preset === '7') {
    return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
  }
  if (preset === '30') {
    return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
  }
  const start = customStart ? startOfDay(parseISO(customStart)) : startOfDay(subDays(now, 7));
  const end = customEnd ? endOfDay(parseISO(customEnd)) : endOfDay(now);
  return { start, end };
}

/** Один элемент ленты: либо событие, либо объединённый блок фоновой активности */
type FeedItem = { kind: 'event'; ev: ActivityEventRow } | { kind: 'merged'; firstAt: string; lastAt: string; view: string; count: number };

function mergeBackgroundActivity(events: ActivityEventRow[]): FeedItem[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const result: FeedItem[] = [];
  let i = 0;
  const BACKGROUND_TYPES = new Set(['page_view', 'heartbeat']);
  const MAX_GAP_MS = 90_000;

  while (i < sorted.length) {
    const ev = sorted[i];
    if (!BACKGROUND_TYPES.has(ev.event_type)) {
      result.push({ kind: 'event', ev });
      i++;
      continue;
    }
    const view = ((ev.payload as Record<string, unknown>)?.view as string) ?? '';
    let lastAt = new Date(ev.created_at).getTime();
    let firstAt = lastAt;
    let count = 1;
    let j = i + 1;
    while (j < sorted.length && sorted[j].session_id === ev.session_id && BACKGROUND_TYPES.has(sorted[j].event_type)) {
      const t = new Date(sorted[j].created_at).getTime();
      if (t - lastAt <= MAX_GAP_MS) {
        lastAt = t;
        count++;
        j++;
      } else break;
    }
    result.push({
      kind: 'merged',
      firstAt: new Date(firstAt).toISOString(),
      lastAt: new Date(lastAt).toISOString(),
      view,
      count,
    });
    i = j;
  }
  return result.reverse();
}

export default function AdminActivity() {
  const { toast } = useToast();
  const [userList, setUserList] = useState<string[]>([]);
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
  const [userFilterMode, setUserFilterMode] = useState<UserFilterMode>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPath, setFilterPath] = useState<string>('all');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pruneDialogOpen, setPruneDialogOpen] = useState(false);
  const [pruneStartDate, setPruneStartDate] = useState('');
  const [pruneEndDate, setPruneEndDate] = useState('');
  const [activityStats, setActivityStats] = useState<{ row_count: number; table_size_bytes: number; table_size_pretty: string } | null>(null);

  const [summary, setSummary] = useState<{
    total_events: number;
    unique_users: number;
    by_day: { date: string; count: number }[];
    by_user: { user_email: string; count: number }[];
  } | null>(null);
  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [sessions, setSessions] = useState<{ session_id: string; user_email: string | null; first_at: string; last_at: string; event_count: number }[]>([]);
  const [eventsOffset, setEventsOffset] = useState(0);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [viewMode, setViewMode] = useState<'events' | 'sessions'>('events');

  const [feedSelectedUserEmails, setFeedSelectedUserEmails] = useState<string[]>([]);
  const [feedSessionId, setFeedSessionId] = useState<string | null>(null);
  const [feedEvents, setFeedEvents] = useState<ActivityEventRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [eventDetailModal, setEventDetailModal] = useState<ActivityEventRow | null>(null);
  const [feedExcludeTestAccounts, setFeedExcludeTestAccounts] = useState(false);
  const [feedOnlySignificant, setFeedOnlySignificant] = useState(false);
  const [feedMergeBackground, setFeedMergeBackground] = useState(true);

  const appliedRef = useRef(false);
  const periodStartRef = useRef<string>('');
  const periodEndRef = useRef<string>('');

  const periodBounds = useMemo(
    () => getPeriodBounds(periodPreset, customStart || undefined, customEnd || undefined),
    [periodPreset, customStart, customEnd]
  );
  const periodStartIso = periodBounds.start.toISOString();
  const periodEndIso = periodBounds.end.toISOString();

  const usersForFilter = useMemo(() => {
    const fromPeriod = summary?.by_user?.length
      ? (summary.by_user.map((u) => u.user_email).filter(Boolean) as string[])
      : userList;
    const merged = new Set<string>([...PINNED_USER_EMAILS, ...fromPeriod]);
    return Array.from(merged).sort((a, b) => {
      const aPinned = PINNED_USER_EMAILS.includes(a);
      const bPinned = PINNED_USER_EMAILS.includes(b);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return a.localeCompare(b);
    });
  }, [summary?.by_user, userList]);

  const customPeriodIncomplete = periodPreset === 'custom' && (!customStart || !customEnd);

  const fetchUserList = useCallback(async () => {
    const { data } = await supabase.from('activity_events').select('user_email');
    const emails = Array.from(new Set((data ?? []).map((r) => r.user_email).filter(Boolean) as string[])).sort();
    setUserList(emails);
  }, []);

  useEffect(() => {
    fetchUserList();
  }, [fetchUserList]);

  const buildEventsQuery = useCallback(
    (offset: number, limit: number) => {
      let q = supabase
        .from('activity_events')
        .select('*')
        .gte('created_at', periodStartRef.current)
        .lte('created_at', periodEndRef.current)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (userFilterMode === 'only' && selectedUserEmails.length > 0) {
        if (selectedUserEmails.length === 1) {
          q = q.eq('user_email', selectedUserEmails[0]);
        } else {
          q = q.in('user_email', selectedUserEmails);
        }
      }
      if (userFilterMode === 'exclude' && selectedUserEmails.length > 0) {
        const quoted = selectedUserEmails.map((e) => `"${String(e).replace(/"/g, '""')}"`).join(',');
        q = q.not('user_email', 'in', `(${quoted})`);
      }
      if (filterType !== 'all') {
        if (filterType === 'treemap') {
          q = q.in('event_type', ['treemap_zoom', 'treemap_click']);
        } else {
          q = q.eq('event_type', filterType);
        }
      }
      if (filterPath && filterPath !== 'all') q = q.ilike('path', `%${filterPath}%`);
      return q;
    },
    [userFilterMode, selectedUserEmails, filterType, filterPath]
  );

  const applyFilters = useCallback(async () => {
    periodStartRef.current = periodStartIso;
    periodEndRef.current = periodEndIso;
    setLoading(true);
    setLoadError(null);
    setEvents([]);
    setSessions([]);
    setEventsOffset(0);

    const userParam =
      userFilterMode === 'only' && selectedUserEmails.length === 1 ? selectedUserEmails[0] : null;
    const typeParam = filterType === 'all' || filterType === 'treemap' ? null : filterType;
    const pathParam = filterPath && filterPath !== 'all' ? filterPath : null;
    const excludeParam =
      userFilterMode === 'exclude' && selectedUserEmails.length > 0 ? selectedUserEmails : null;
    const includeParam =
      userFilterMode === 'only' && selectedUserEmails.length > 0 ? selectedUserEmails : null;

    try {
      const [summaryRes, eventsRes] = await Promise.all([
        supabase.rpc('get_activity_summary', {
          period_start: periodStartIso,
          period_end: periodEndIso,
          filter_user_email: userParam,
          filter_type: typeParam,
          filter_path: pathParam,
          exclude_user_emails: excludeParam,
          include_user_emails: includeParam,
        }),
        buildEventsQuery(0, PAGE_SIZE),
      ]);

      if (summaryRes.error) {
        setLoadError(summaryRes.error.message);
        toast({ title: 'Ошибка загрузки сводки', description: summaryRes.error.message, variant: 'destructive' });
      } else if (summaryRes.data) {
        const d = summaryRes.data as {
          total_events: number;
          unique_users: number;
          by_day: { date: string; count: number }[];
          by_user?: { user_email: string; count: number }[];
        };
        setSummary({
          total_events: Number(d.total_events),
          unique_users: Number(d.unique_users),
          by_day: Array.isArray(d.by_day) ? d.by_day : [],
          by_user: Array.isArray(d.by_user) ? d.by_user : [],
        });
      }

      if (eventsRes.error) {
        if (!loadError) setLoadError(eventsRes.error.message);
        toast({ title: 'Ошибка загрузки событий', description: eventsRes.error.message, variant: 'destructive' });
        setEvents([]);
      } else {
        const list = eventsRes.data ?? [];
        setEvents(list);
        setHasMoreEvents(list.length === PAGE_SIZE);
      }

      const sessionsRes = await supabase.rpc('get_activity_sessions', {
        period_start: periodStartIso,
        period_end: periodEndIso,
        filter_user_email: userParam,
        filter_type: typeParam,
        exclude_user_emails: excludeParam,
        include_user_emails: includeParam,
      });
      if (sessionsRes.error) {
        toast({ title: 'Ошибка загрузки сессий', description: sessionsRes.error.message, variant: 'destructive' });
        setSessions([]);
      } else {
        const list = sessionsRes.data ?? [];
        setSessions(list);
      }

      const err =
        summaryRes.error?.message ?? eventsRes.error?.message ?? sessionsRes.error?.message ?? null;
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [periodStartIso, periodEndIso, userFilterMode, selectedUserEmails, filterType, filterPath, buildEventsQuery, toast]);

  useEffect(() => {
    if (!appliedRef.current) {
      appliedRef.current = true;
      applyFilters();
    }
  }, [applyFilters]);

  const loadMoreEvents = useCallback(async () => {
    const nextOffset = eventsOffset + PAGE_SIZE;
    setLoadingMore(true);
    const { data, error } = await buildEventsQuery(nextOffset, PAGE_SIZE);
    setLoadingMore(false);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    const list = data ?? [];
    setEvents((prev) => [...prev, ...list]);
    setEventsOffset(nextOffset);
    setHasMoreEvents(list.length === PAGE_SIZE);
  }, [eventsOffset, buildEventsQuery, toast]);

  const loadFeedEvents = useCallback(async () => {
    if (feedSelectedUserEmails.length === 0) {
      setFeedEvents([]);
      return;
    }
    setFeedLoading(true);
    let q = supabase
      .from('activity_events')
      .select('*')
      .in('user_email', feedSelectedUserEmails)
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (feedSessionId && feedSelectedUserEmails.length === 1) q = q.eq('session_id', feedSessionId);
    const { data, error } = await q;
    setFeedLoading(false);
    if (error) {
      toast({ title: 'Ошибка ленты', description: error.message, variant: 'destructive' });
      setFeedEvents([]);
      return;
    }
    setFeedEvents((data ?? []) as ActivityEventRow[]);
  }, [feedSelectedUserEmails, feedSessionId, periodStartIso, periodEndIso, toast]);

  useEffect(() => {
    loadFeedEvents();
  }, [loadFeedEvents]);

  const usersForFeed = useMemo(() => {
    if (!feedExcludeTestAccounts || TEST_USER_EMAILS.length === 0) return usersForFilter;
    const set = new Set(TEST_USER_EMAILS.map((e) => e.toLowerCase()));
    return usersForFilter.filter((email) => !set.has(email.toLowerCase()));
  }, [usersForFilter, feedExcludeTestAccounts]);

  const sessionsForFeedUser = useMemo(() => {
    if (feedSelectedUserEmails.length !== 1) return [];
    return sessions.filter((s) => s.user_email === feedSelectedUserEmails[0]);
  }, [sessions, feedSelectedUserEmails]);

  const feedEventsDisplay = useMemo((): FeedItem[] => {
    if (feedOnlySignificant) {
      const filtered = feedEvents.filter((ev) => ev.event_type !== 'page_view' && ev.event_type !== 'heartbeat');
      return filtered.map((ev) => ({ kind: 'event' as const, ev }));
    }
    if (feedMergeBackground) return mergeBackgroundActivity(feedEvents);
    return feedEvents.map((ev) => ({ kind: 'event' as const, ev }));
  }, [feedEvents, feedOnlySignificant, feedMergeBackground]);

  const openFeedForSession = useCallback((userEmail: string | null, sessionId: string | null) => {
    setFeedSelectedUserEmails(userEmail ? [userEmail] : []);
    setFeedSessionId(sessionId);
  }, []);

  const timelineUsers = useMemo(() => {
    const byUser = new Map<string, { sessions: typeof sessions; eventCount: number; firstAt: string; lastAt: string }>();
    for (const s of sessions) {
      const email = s.user_email ?? '—';
      const existing = byUser.get(email);
      const firstAt = existing ? (s.first_at < existing.firstAt ? s.first_at : existing.firstAt) : s.first_at;
      const lastAt = existing ? (s.last_at > existing.lastAt ? s.last_at : existing.lastAt) : s.last_at;
      const eventCount = (existing?.eventCount ?? 0) + Number(s.event_count ?? 0);
      const sessionsList = existing ? [...existing.sessions, s] : [s];
      byUser.set(email, { sessions: sessionsList, eventCount, firstAt, lastAt });
    }
    return Array.from(byUser.entries())
      .map(([user_email, v]) => ({ user_email, ...v, durationMs: v.sessions.reduce((acc, s) => acc + (parseISO(s.last_at).getTime() - parseISO(s.first_at).getTime()), 0) }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 20);
  }, [sessions]);

  const fetchActivityStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_activity_events_stats');
    if (error || !data) {
      setActivityStats(null);
      return;
    }
    const d = data as { row_count?: number; table_size_bytes?: number; table_size_pretty?: string };
    setActivityStats({
      row_count: Number(d.row_count ?? 0),
      table_size_bytes: Number(d.table_size_bytes ?? 0),
      table_size_pretty: String(d.table_size_pretty ?? '—'),
    });
  }, []);

  useEffect(() => {
    fetchActivityStats();
  }, [fetchActivityStats]);

  const runPruneByRange = async () => {
    if (!pruneStartDate || !pruneEndDate) return;
    const startIso = startOfDay(parseISO(pruneStartDate)).toISOString();
    const endIso = endOfDay(parseISO(pruneEndDate)).toISOString();
    setPruneDialogOpen(false);
    setPruning(true);
    const { data, error } = await supabase.rpc('prune_activity_events_by_range', {
      period_start: startIso,
      period_end: endIso,
    });
    setPruning(false);
    if (error) {
      toast({ title: 'Ошибка очистки', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Готово', description: `Удалено событий: ${data ?? 0}` });
    applyFilters();
    fetchActivityStats();
  };

  const pruneRangeValid = pruneStartDate && pruneEndDate && pruneStartDate <= pruneEndDate;
  const needsCleanupHint = activityStats && (
    activityStats.row_count > ACTIVITY_STATS_ROW_THRESHOLD ||
    activityStats.table_size_bytes > ACTIVITY_STATS_SIZE_BYTES_THRESHOLD
  );

  const exportCsv = useCallback(async () => {
    const typeParam = filterType === 'all' ? null : filterType;
    let q = supabase
      .from('activity_events')
      .select('*')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
      .limit(EXPORT_LIMIT);
    if (userFilterMode === 'only' && selectedUserEmails.length > 0) {
      if (selectedUserEmails.length === 1) q = q.eq('user_email', selectedUserEmails[0]);
      else q = q.in('user_email', selectedUserEmails);
    }
    if (userFilterMode === 'exclude' && selectedUserEmails.length > 0) {
      const quoted = selectedUserEmails.map((e) => `"${String(e).replace(/"/g, '""')}"`).join(',');
      q = q.not('user_email', 'in', `(${quoted})`);
    }
    if (typeParam) {
      if (typeParam === 'treemap') q = q.in('event_type', ['treemap_zoom', 'treemap_click']);
      else q = q.eq('event_type', typeParam);
    }
    if (filterPath && filterPath !== 'all') q = q.ilike('path', `%${filterPath}%`);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Ошибка экспорта', description: error.message, variant: 'destructive' });
      return;
    }
    const rows = data ?? [];
    const header = 'Время;Пользователь;Тип;Путь;Действие;Данные';
    const lines = rows.map((ev) => {
      const time = formatDate(ev.created_at);
      const user = ev.user_email ?? ev.user_id;
      const type = formatEventType(ev.event_type);
      const path = ev.path ?? '';
      const action = formatEventSummary(ev as ActivityEventRow);
      const payload = formatPayloadCell(ev as ActivityEventRow);
      return [time, user, type, path, action, payload].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';');
    });
    const csv = [header, ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Экспорт завершён', description: `Скачано событий: ${rows.length}` });
  }, [periodStartIso, periodEndIso, userFilterMode, selectedUserEmails, filterType, filterPath, toast]);

  const chartData = useMemo(() => {
    if (!summary?.by_user?.length) return [];
    const top = summary.by_user.slice(0, CHART_TOP_N);
    return top.map((u, i) => ({
      user: u.user_email || '—',
      count: u.count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [summary?.by_user]);

  const chartOmittedCount = (summary?.by_user?.length ?? 0) > CHART_TOP_N
    ? (summary!.by_user.length - CHART_TOP_N)
    : 0;

  const appliedFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Период: ${format(periodBounds.start, 'dd.MM', { locale: ru })} – ${format(periodBounds.end, 'dd.MM.yyyy', { locale: ru })}`);
    if (userFilterMode === 'all') parts.push('Пользователи: все');
    else if (userFilterMode === 'only' && selectedUserEmails.length > 0)
      parts.push(`Пользователи: только ${selectedUserEmails.length}`);
    else if (userFilterMode === 'exclude' && selectedUserEmails.length > 0)
      parts.push(`Пользователи: исключено ${selectedUserEmails.length}`);
    parts.push(`Путь: ${PATH_PRESETS.find((p) => p.value === filterPath)?.label ?? filterPath}`);
    parts.push(`Тип: ${filterType === 'all' ? 'все' : EVENT_TYPE_LABELS[filterType] ?? filterType}`);
    return parts.join(' · ');
  }, [periodBounds, userFilterMode, selectedUserEmails, filterPath, filterType]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AdminHeader currentView="activity" />

      <main className="flex-1 flex flex-col overflow-auto p-6 min-h-0">
        <h1 className="font-juneau font-medium text-xl shrink-0">Активность</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-4 shrink-0">
          Просмотры страниц, активность вкладки и клики по выбранному периоду. Выберите период и нажмите «Применить», чтобы обновить сводку и таблицы.
        </p>

        {/* Top bar: period + summary + Apply */}
        <div className="flex flex-wrap items-center gap-4 py-3 px-4 rounded-lg bg-muted/40 border border-border/60 shrink-0 mb-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Период</Label>
            <div className="flex items-center gap-2">
              <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Последние 7 дней</SelectItem>
                  <SelectItem value="30">Последние 30 дней</SelectItem>
                  <SelectItem value="custom">Произвольный</SelectItem>
                </SelectContent>
              </Select>
              {periodPreset === 'custom' && (
                <>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36" placeholder="От" />
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36" placeholder="До" />
                </>
              )}
              <span className="text-xs text-muted-foreground">
                {periodPreset === 'custom' && !customStart && !customEnd
                  ? 'Укажите даты'
                  : `${format(periodBounds.start, 'dd.MM', { locale: ru })} – ${format(periodBounds.end, 'dd.MM.yyyy', { locale: ru })}`}
              </span>
            </div>
          </div>
          <Button onClick={applyFilters} disabled={customPeriodIncomplete || loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Применить
          </Button>
          {summary !== null && (
            <>
              <span className="text-muted-foreground/60">|</span>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{summary.total_events.toLocaleString('ru-RU')}</span>
                {' событий · '}
                <span className="font-semibold text-foreground tabular-nums">{summary.unique_users.toLocaleString('ru-RU')}</span>
                {' польз.'}
              </span>
            </>
          )}
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 mb-4 shrink-0 flex items-center justify-between gap-4">
            <p className="text-sm text-destructive">Не удалось загрузить данные. {loadError}</p>
            <Button variant="outline" size="sm" onClick={() => applyFilters()}>Повторить</Button>
          </div>
        )}

        {summary !== null && !loadError && (
          <p className="text-xs text-muted-foreground mb-2 shrink-0">{appliedFiltersLabel}</p>
        )}

        {/* Block 1: Who came and how long — timeline (bars = sessions) + summary table; click bar → feed */}
        {summary !== null && sessions.length > 0 && !loadError && (
          <div className="rounded-lg border border-border bg-card p-4 my-4 shrink-0">
            <p className="text-sm font-medium mb-3">Кто заходил и как долго</p>
            <p className="text-xs text-muted-foreground mb-3">
              Ось времени — период. Строка — пользователь, полоски — сессии. Клик по полоске открывает ленту событий этой сессии ниже.
            </p>
            <div className="overflow-x-auto">
              {(() => {
                const startMs = periodBounds.start.getTime();
                const endMs = periodBounds.end.getTime();
                const rangeMs = Math.max(endMs - startMs, 1);
                return (
                  <div className="min-w-[600px] space-y-1.5">
                    <div className="flex text-xs text-muted-foreground mb-1">
                      <span className="w-44 shrink-0">{format(periodBounds.start, 'dd.MM HH:mm', { locale: ru })}</span>
                      <span className="flex-1" />
                      <span>{format(periodBounds.end, 'dd.MM HH:mm', { locale: ru })}</span>
                    </div>
                    {timelineUsers.map((u) => (
                      <div key={u.user_email} className="flex items-center gap-2 h-8">
                        <span className="w-44 shrink-0 text-xs truncate" title={u.user_email}>
                          {u.user_email}
                        </span>
                        <div className="flex-1 h-5 bg-muted/50 rounded relative">
                          {u.sessions.map((s) => {
                            const sFirst = parseISO(s.first_at).getTime();
                            const sLast = parseISO(s.last_at).getTime();
                            const left = ((sFirst - startMs) / rangeMs) * 100;
                            const width = Math.max((sLast - sFirst) / rangeMs * 100, 0.5);
                            const durationMin = Math.round((sLast - sFirst) / 60000);
                            return (
                              <Tooltip key={s.session_id} delayDuration={200}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="absolute top-0 bottom-0 bg-primary/70 hover:bg-primary rounded cursor-pointer transition-colors"
                                    style={{ left: `${left}%`, width: `${width}%`, minWidth: 4 }}
                                    onClick={() => openFeedForSession(u.user_email, s.session_id)}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-medium text-xs">Сессия</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateShort(s.first_at)} – {formatDateShort(s.last_at)}
                                  </p>
                                  <p className="text-xs mt-1">Событий: {s.event_count} · Длительность: {durationMin} мин</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="mt-4 rounded border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Пользователь</TableHead>
                    <TableHead className="w-[80px]">Сессий</TableHead>
                    <TableHead className="w-[80px]">Событий</TableHead>
                    <TableHead className="w-[130px]">Первый заход</TableHead>
                    <TableHead className="w-[130px]">Последняя активность</TableHead>
                    <TableHead className="w-[90px]">Длительность</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timelineUsers.map((u) => (
                    <TableRow key={u.user_email}>
                      <TableCell className="text-sm">{u.user_email}</TableCell>
                      <TableCell className="tabular-nums">{u.sessions.length}</TableCell>
                      <TableCell className="tabular-nums">{u.eventCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(u.firstAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(u.lastAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{Math.round(u.durationMs / 60000)} мин</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Chart by user */}
        {summary !== null && chartData.length > 0 && !loadError && (
          <div className="rounded-lg border border-border bg-card p-4 my-4 shrink-0">
            <p className="text-sm font-medium mb-3">
              События по пользователям
              {chartOmittedCount > 0 && (
                <span className="text-muted-foreground font-normal ml-2">(показаны топ-{CHART_TOP_N}, ещё {chartOmittedCount})</span>
              )}
            </p>
            <ChartContainer config={{ count: { label: 'Событий' } }} className="h-[220px] w-full">
              <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="user" width={140} tick={{ fontSize: 11 }} />
                <Bar dataKey="count" name="Событий" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Block 2: What they did — user + session selector, readable feed, click → modal */}
        {summary !== null && !loadError && (
          <div className="rounded-lg border border-border bg-card p-4 my-4 shrink-0">
            <p className="text-sm font-medium mb-3">Что делали</p>
            <p className="text-xs text-muted-foreground mb-3">
              Выберите одного или нескольких пользователей (и при одном пользователе — опционально сессию). Лента: время и действие. Клик по строке — полные данные. Можно скрыть повторяющиеся «просмотры» и «пульс» или объединить их в блоки.
            </p>
            <div className="flex flex-wrap items-end gap-4 mb-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Пользователи</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-56 justify-between font-normal">
                      {feedSelectedUserEmails.length === 0
                        ? 'Выбрать...'
                        : `Выбрано: ${feedSelectedUserEmails.length}`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        id="feed-exclude-test"
                        checked={feedExcludeTestAccounts}
                        onCheckedChange={(c) => setFeedExcludeTestAccounts(!!c)}
                      />
                      <label htmlFor="feed-exclude-test" className="text-xs cursor-pointer">Исключить тестовые аккаунты</label>
                    </div>
                    <div className="max-h-56 overflow-auto space-y-1">
                      {usersForFeed.map((email) => (
                        <label key={email} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-muted/60">
                          <Checkbox
                            checked={feedSelectedUserEmails.includes(email)}
                            onCheckedChange={(checked) => {
                              setFeedSelectedUserEmails((prev) =>
                                checked ? [...prev, email] : prev.filter((e) => e !== email)
                              );
                            }}
                          />
                          <span className="text-sm truncate">{email}</span>
                        </label>
                      ))}
                      {usersForFeed.length === 0 && (
                        <p className="text-sm text-muted-foreground px-2 py-2">Нет пользователей</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {feedSelectedUserEmails.length === 1 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Сессия</Label>
                  <Select
                    value={feedSessionId ?? 'all'}
                    onValueChange={(v) => setFeedSessionId(v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все сессии</SelectItem>
                      {sessionsForFeedUser.map((s) => (
                        <SelectItem key={s.session_id} value={s.session_id}>
                          {formatDateShort(s.first_at)} – {formatDateShort(s.last_at)} ({s.event_count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={feedOnlySignificant}
                  onCheckedChange={(c) => setFeedOnlySignificant(!!c)}
                />
                <span className="text-xs">Только значимые действия (без просмотров страницы и пульса)</span>
              </label>
              {!feedOnlySignificant && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={feedMergeBackground}
                    onCheckedChange={(c) => setFeedMergeBackground(!!c)}
                  />
                  <span className="text-xs">Объединять фоновую активность в блоки (с … по …)</span>
                </label>
              )}
            </div>
            <ScrollArea className="h-[280px] rounded-md border border-border">
              {feedSelectedUserEmails.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                  Выберите пользователей
                </div>
              ) : feedLoading ? (
                <div className="flex items-center justify-center h-full py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : feedEventsDisplay.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                  Нет событий за период
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Время</TableHead>
                      <TableHead>Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedEventsDisplay.map((item, idx) =>
                      item.kind === 'event' ? (
                        <TableRow
                          key={item.ev.id}
                          className="cursor-pointer hover:bg-muted/60"
                          onClick={() => setEventDetailModal(item.ev)}
                        >
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap py-1.5">
                            {formatDate(item.ev.created_at)}
                          </TableCell>
                          <TableCell className="text-sm py-1.5">{formatEventSummary(item.ev)}</TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={`merged-${idx}-${item.firstAt}`} className="bg-muted/30">
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap py-1.5">
                            {formatDateShort(item.firstAt)} – {formatDateShort(item.lastAt)}
                          </TableCell>
                          <TableCell className="text-sm py-1.5">
                            На дашборде{item.view ? ` (вкладка ${item.view})` : ''}: активность с {format(parseISO(item.firstAt), 'HH:mm', { locale: ru })} по {format(parseISO(item.lastAt), 'HH:mm', { locale: ru })} · {item.count} событий
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              )}
              <ScrollBar orientation="vertical" />
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">Клик по строке — полный payload</p>
          </div>
        )}

        {/* Event detail modal */}
        <Dialog open={!!eventDetailModal} onOpenChange={(open) => !open && setEventDetailModal(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {eventDetailModal ? formatEventType(eventDetailModal.event_type) : ''}
              </DialogTitle>
              <DialogDescription>
                {eventDetailModal && (
                  <>
                    {formatDate(eventDetailModal.created_at)} · {eventDetailModal.user_email ?? eventDetailModal.user_id} · {eventDetailModal.path ?? '—'}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {eventDetailModal && (
              <ScrollArea className="flex-1 min-h-0 rounded border border-border p-3 text-xs font-mono bg-muted/30">
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(eventDetailModal.payload, null, 2)}
                </pre>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* Filters: users (one multiselect + mode), path, type, export, prune */}
        <div className="flex flex-wrap items-end gap-4 mb-4 p-4 rounded-lg border border-border bg-muted/30 shrink-0">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Пользователи</Label>
            <div className="flex items-center gap-2">
              <Select value={userFilterMode} onValueChange={(v) => setUserFilterMode(v as UserFilterMode)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="only">Только выбранные</SelectItem>
                  <SelectItem value="exclude">Исключить выбранных</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-52 justify-between font-normal">
                    {selectedUserEmails.length === 0
                      ? 'Выбрать...'
                      : `Выбрано: ${selectedUserEmails.length}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="max-h-64 overflow-auto space-y-1">
                    {usersForFilter.map((email) => (
                      <label key={email} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-muted/60">
                        <Checkbox
                          checked={selectedUserEmails.includes(email)}
                          onCheckedChange={(checked) => {
                            setSelectedUserEmails((prev) =>
                              checked ? [...prev, email] : prev.filter((e) => e !== email)
                            );
                          }}
                        />
                        <span className="text-sm truncate">{email}</span>
                      </label>
                    ))}
                    {usersForFilter.length === 0 && (
                      <p className="text-sm text-muted-foreground px-2 py-2">Нет пользователей. Примените период.</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Путь</Label>
            <Select value={filterPath} onValueChange={setFilterPath}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                {PATH_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Тип</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="page_view">Просмотр страницы</SelectItem>
                <SelectItem value="heartbeat">Активность</SelectItem>
                <SelectItem value="click">Клик</SelectItem>
                <SelectItem value="view_switch">Смена вкладки</SelectItem>
                <SelectItem value="treemap">Тримап (зум/клик)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} disabled={customPeriodIncomplete || loading}>Применить</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading} title={`До ${EXPORT_LIMIT.toLocaleString('ru-RU')} записей`}>
            <Download className="h-4 w-4 mr-2" />
            Скачать CSV (до {EXPORT_LIMIT.toLocaleString('ru-RU')})
          </Button>
        </div>

        {/* Удаление за период + индикация объёма */}
        <div className="flex flex-wrap items-end gap-4 mb-4 p-4 rounded-lg border border-border bg-muted/20 shrink-0">
          {activityStats !== null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-muted-foreground">
                Событий в БД: <span className="font-medium text-foreground tabular-nums">{activityStats.row_count.toLocaleString('ru-RU')}</span>
                {' '}({activityStats.table_size_pretty})
              </span>
              {needsCleanupHint && (
                <span className="text-xs text-primary font-medium">Рекомендуется удалить часть событий</span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Удалить события с</Label>
              <Input
                type="date"
                value={pruneStartDate}
                onChange={(e) => setPruneStartDate(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">по</Label>
              <Input
                type="date"
                value={pruneEndDate}
                onChange={(e) => setPruneEndDate(e.target.value)}
                className="w-36"
              />
            </div>
            <AlertDialog open={pruneDialogOpen} onOpenChange={setPruneDialogOpen}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pruneRangeValid && setPruneDialogOpen(true)}
                disabled={pruning || !pruneRangeValid}
                className="border-red-600/35 text-red-700 bg-red-50/50 hover:bg-red-100/80 hover:text-red-800 dark:border-red-500/40 dark:text-red-400 dark:bg-red-950/30 dark:hover:bg-red-950/50"
              >
                {pruning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Удалить за выбранный период
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить события за период?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {pruneStartDate && pruneEndDate && (
                      <>Удалить все события с {format(parseISO(pruneStartDate), 'dd.MM.yyyy', { locale: ru })} по {format(parseISO(pruneEndDate), 'dd.MM.yyyy', { locale: ru })}? Действие необратимо.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={runPruneByRange} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4 shrink-0">
          Удаление событий за выбранный диапазон дат.
        </p>

        {/* Tabs: Events | Sessions — larger min height so table is easy to scroll and read */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'events' | 'sessions')} className="flex-1 flex flex-col min-h-[560px]">
          <div className="flex items-center justify-between gap-4 mb-2">
            <TabsList>
              <TabsTrigger value="events" className="gap-2">
                <List className="h-4 w-4" />
                События
              </TabsTrigger>
              <TabsTrigger value="sessions" className="gap-2">
                <Users className="h-4 w-4" />
                Сессии
              </TabsTrigger>
            </TabsList>
            {viewMode === 'sessions' && (
              <p className="text-xs text-muted-foreground">
                Сессия — один браузер/вкладка; первый и последний заход — по событиям в этой сессии.
              </p>
            )}
          </div>

          <TabsContent value="events" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <ScrollArea className="flex-1 min-h-[420px] rounded-md border border-border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                  <p className="font-medium text-destructive">Ошибка загрузки</p>
                  <p className="text-sm mt-1">Нажмите «Повторить» выше</p>
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                  <Activity className="h-10 w-10 mb-2" />
                  <p className="font-medium">Нет событий за выбранный период</p>
                  <p className="text-sm mt-1">Измените период или фильтры и нажмите «Применить»</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Время</TableHead>
                        <TableHead className="min-w-[180px]">Пользователь</TableHead>
                        <TableHead className="w-[120px]">Тип</TableHead>
                        <TableHead className="min-w-[120px]">Путь</TableHead>
                        <TableHead>Данные</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDate(ev.created_at)}</TableCell>
                          <TableCell className="text-sm">{ev.user_email ?? ev.user_id}</TableCell>
                          <TableCell className="text-xs font-medium">{formatEventType(ev.event_type)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={ev.path ?? ''}>
                            {ev.path ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={formatPayloadCell(ev)}>
                            {formatPayloadCell(ev)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {hasMoreEvents && (
                    <div className="p-4 flex justify-center border-t border-border">
                      <Button variant="outline" size="sm" onClick={loadMoreEvents} disabled={loadingMore}>
                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Показать ещё
                      </Button>
                    </div>
                  )}
                </>
              )}
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sessions" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <ScrollArea className="flex-1 min-h-[420px] rounded-md border border-border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                  <p className="font-medium text-destructive">Ошибка загрузки</p>
                  <p className="text-sm mt-1">Нажмите «Повторить» выше</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                  <Users className="h-10 w-10 mb-2" />
                  <p className="font-medium">Нет сессий за выбранный период</p>
                  <p className="text-sm mt-1">Измените период или фильтры и нажмите «Применить»</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Пользователь</TableHead>
                      <TableHead className="w-[140px]">Первый заход</TableHead>
                      <TableHead className="w-[140px]">Последняя активность</TableHead>
                      <TableHead className="w-[80px]">Событий</TableHead>
                      <TableHead className="w-[100px]">Длительность</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((row) => {
                      const first = parseISO(row.first_at);
                      const last = parseISO(row.last_at);
                      const durationMin = Math.round((last.getTime() - first.getTime()) / 60000);
                      return (
                        <TableRow key={row.session_id}>
                          <TableCell className="text-sm">{row.user_email ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(row.first_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(row.last_at)}</TableCell>
                          <TableCell className="tabular-nums">{row.event_count}</TableCell>
                          <TableCell className="text-muted-foreground">{durationMin} мин</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
