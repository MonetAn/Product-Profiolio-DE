import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type PeriodMode = '14' | 'custom';

type PresenceItem = {
  user_email: string;
  day: string;
  portfolio: boolean;
  admin: boolean;
  first_seen_at: string;
};

/** Inclusive UTC calendar range: last `spanDays` days ending today (UTC). */
function utcInclusiveRange(spanDays: number): { startStr: string; endStr: string } {
  const now = new Date();
  const endStr = now.toISOString().slice(0, 10);
  const endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startMs = endUtc - (spanDays - 1) * 86400000;
  const s = new Date(startMs);
  const startStr = `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
  return { startStr, endStr };
}

/** List each UTC date from start through end inclusive (yyyy-MM-dd). */
function enumerateUtcDays(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr || startStr > endStr) return [];
  const out: string[] = [];
  let cur = parseISO(`${startStr}T12:00:00.000Z`);
  const end = parseISO(`${endStr}T12:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

function PresenceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground mb-4">
      <span className="flex items-center gap-2">
        <span className="inline-block size-4 shrink-0 rounded-sm bg-blue-500" aria-hidden />
        Портфель
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block size-4 shrink-0 rounded-sm bg-primary" aria-hidden />
        Админка
      </span>
      <span className="flex items-center gap-2">
        <span
          className="inline-block size-4 shrink-0 rounded-sm"
          style={{
            background: 'linear-gradient(135deg, rgb(59 130 246) 50%, hsl(var(--primary)) 50%)',
          }}
          aria-hidden
        />
        Оба
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="inline-block size-4 shrink-0 rounded-sm border border-border bg-muted/50" aria-hidden />
        Нет заходов
      </span>
    </div>
  );
}

function PresenceCell({ portfolio, admin }: { portfolio: boolean; admin: boolean }) {
  if (!portfolio && !admin) {
    return <div className="size-7 shrink-0 rounded-sm border border-border bg-muted/50" />;
  }
  if (portfolio && !admin) {
    return <div className="size-7 shrink-0 rounded-sm bg-blue-500" />;
  }
  if (!portfolio && admin) {
    return <div className="size-7 shrink-0 rounded-sm bg-primary" />;
  }
  return (
    <div
      className="size-7 shrink-0 rounded-sm"
      style={{
        background: 'linear-gradient(135deg, rgb(59 130 246) 50%, hsl(var(--primary)) 50%)',
      }}
    />
  );
}

export default function AdminActivity() {
  const { toast } = useToast();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('14');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [items, setItems] = useState<PresenceItem[]>([]);
  const [stats, setStats] = useState<{ row_count: number; table_size_pretty: string } | null>(null);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [pruneStart, setPruneStart] = useState('');
  const [pruneEnd, setPruneEnd] = useState('');
  const [pruning, setPruning] = useState(false);

  const { startDateStr, endDateStr } = useMemo(() => {
    if (periodMode === '14') {
      const r = utcInclusiveRange(14);
      return { startDateStr: r.startStr, endDateStr: r.endStr };
    }
    return {
      startDateStr: customStart || '',
      endDateStr: customEnd || '',
    };
  }, [periodMode, customStart, customEnd]);

  const customIncomplete = periodMode === 'custom' && (!customStart || !customEnd || customStart > customEnd);

  const dayColumns = useMemo(
    () => enumerateUtcDays(startDateStr, endDateStr),
    [startDateStr, endDateStr]
  );

  const load = useCallback(async () => {
    if (!startDateStr || !endDateStr) return;
    setLoading(true);
    try {
      const { data: statsData } = await supabase.rpc('get_user_presence_stats');
      if (statsData && typeof statsData === 'object') {
        const s = statsData as { row_count?: number; table_size_pretty?: string };
        setStats({
          row_count: Number(s.row_count ?? 0),
          table_size_pretty: String(s.table_size_pretty ?? '—'),
        });
      } else {
        setStats(null);
      }

      const { data, error } = await supabase.rpc('get_presence_timeline', {
        period_start: startDateStr,
        period_end: endDateStr,
        filter_user_email: null,
      });

      if (error) {
        toast({ title: 'Ошибка загрузки', description: error.message, variant: 'destructive' });
        setItems([]);
        setUsers([]);
        return;
      }

      const raw = (data ?? {}) as { users?: string[]; items?: PresenceItem[] };
      const u = Array.isArray(raw.users) ? raw.users.filter(Boolean) : [];
      const it = Array.isArray(raw.items) ? raw.items : [];
      setUsers(u);
      setItems(it);
    } finally {
      setLoading(false);
    }
  }, [startDateStr, endDateStr, toast]);

  useEffect(() => {
    if (!customIncomplete) void load();
  }, [load, customIncomplete]);

  const itemByUserDay = useMemo(() => {
    const m = new Map<string, PresenceItem>();
    for (const it of items) {
      m.set(`${it.user_email}|${it.day}`, it);
    }
    return m;
  }, [items]);

  const sortedUserRows = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.user_email) set.add(it.user_email);
    }
    for (const u of users) {
      if (u) set.add(u);
    }
    const list = Array.from(set);
    const lastDay = new Map<string, string>();
    for (const it of items) {
      const e = it.user_email;
      if (!e) continue;
      const prev = lastDay.get(e);
      if (!prev || it.day > prev) lastDay.set(e, it.day);
    }
    list.sort((a, b) => {
      const da = lastDay.get(a) ?? '';
      const db = lastDay.get(b) ?? '';
      if (da !== db) return db.localeCompare(da);
      return a.localeCompare(b);
    });
    return list;
  }, [items, users]);

  const runPrune = async () => {
    if (!pruneStart || !pruneEnd || pruneStart > pruneEnd) return;
    setPruning(true);
    setPruneOpen(false);
    const { data, error } = await supabase.rpc('prune_user_presence_by_range', {
      period_start: pruneStart,
      period_end: pruneEnd,
    });
    setPruning(false);
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Удалено записей', description: String(data ?? 0) });
    void load();
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AdminHeader currentView="activity" />

      <main className="flex-1 flex flex-col overflow-auto p-6 min-h-0 w-full max-w-[min(100%,120rem)] mx-auto">
        <h1 className="font-juneau font-medium text-xl shrink-0">Присутствие</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-2 shrink-0">
          Дни по UTC. Не больше одной отметки на зону в сутки: портфель и админка.
        </p>

        <PresenceLegend />

        <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg border border-border bg-muted/30 mb-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={periodMode === '14' ? 'default' : 'outline'}
              onClick={() => setPeriodMode('14')}
            >
              Последние 14 дней (UTC)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodMode === 'custom' ? 'default' : 'outline'}
              onClick={() => setPeriodMode('custom')}
            >
              Свой диапазон
            </Button>
          </div>
          {periodMode === 'custom' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">С (UTC-день)</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">По</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
              </div>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || customIncomplete}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Обновить'}
          </Button>
          {periodMode === '14' && (
            <span className="text-xs text-muted-foreground self-center">
              {startDateStr} — {endDateStr}
            </span>
          )}
        </div>

        {stats && (
          <p className="text-xs text-muted-foreground mb-3">
            Записей в БД: <span className="font-medium text-foreground tabular-nums">{stats.row_count}</span> (
            {stats.table_size_pretty})
          </p>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden mb-8 flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedUserRows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">Нет данных за выбранный период.</p>
          ) : (
            <div className="overflow-auto flex-1 min-h-[200px]">
              <table className="w-max min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-card border-b border-r border-border px-3 py-2 text-left font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] min-w-[200px]">
                      Пользователь
                    </th>
                    {dayColumns.map((d) => (
                      <th
                        key={d}
                        className="border-b border-border px-1 py-2 text-center font-normal text-muted-foreground whitespace-nowrap w-10 min-w-[2.25rem]"
                      >
                        <div className="text-[10px] leading-tight">{format(parseISO(`${d}T12:00:00.000Z`), 'dd.MM', { locale: ru })}</div>
                        <div className="text-[9px] uppercase opacity-80">
                          {format(parseISO(`${d}T12:00:00.000Z`), 'EEE', { locale: ru })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedUserRows.map((email) => (
                    <tr key={email} className="border-b border-border/80">
                      <td className="sticky left-0 z-10 bg-card border-r border-border px-3 py-1.5 align-middle truncate max-w-[280px] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        {email}
                      </td>
                      {dayColumns.map((d) => {
                        const row = itemByUserDay.get(`${email}|${d}`);
                        return (
                          <td key={d} className="p-1 align-middle text-center">
                            <div className="inline-flex justify-center">
                              <PresenceCell portfolio={row?.portfolio ?? false} admin={row?.admin ?? false} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-3 shrink-0">
          <p className="text-sm font-medium">Удалить записи за диапазон дат (UTC)</p>
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={pruneStart} onChange={(e) => setPruneStart(e.target.value)} className="w-40" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={pruneEnd} onChange={(e) => setPruneEnd(e.target.value)} className="w-40" />
            <Button
              variant="outline"
              size="sm"
              className="border-red-600/35 text-red-700 bg-red-50/50 hover:bg-red-100/80 dark:border-red-500/40 dark:text-red-400 dark:bg-red-950/30"
              disabled={!pruneStart || !pruneEnd || pruneStart > pruneEnd || pruning}
              onClick={() => setPruneOpen(true)}
            >
              {pruning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Удалить
            </Button>
          </div>
        </div>

        <AlertDialog open={pruneOpen} onOpenChange={setPruneOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить записи присутствия?</AlertDialogTitle>
              <AlertDialogDescription>
                Будут удалены все строки за период {pruneStart} — {pruneEnd} (UTC). Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={() => void runPrune()} className="bg-destructive text-destructive-foreground">
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
