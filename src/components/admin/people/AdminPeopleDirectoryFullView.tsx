import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { TeamSnapshot } from '@/hooks/useTeamSnapshots';
import { Input } from '@/components/ui/input';
import { PeopleDirectoryRows } from '@/components/admin/people/PeopleDirectoryRows';
import { findAllRosterConflictingPersonIds } from '@/lib/rosterQuarterUtils';
import {
  type Person,
  isManualPendingReview,
} from '@/lib/peopleDataManager';
import { cn } from '@/lib/utils';

type DirectoryFilter = 'all' | 'pending' | 'unassigned' | 'roster_conflicts';

type Props = {
  people: Person[];
  snapshots: TeamSnapshot[];
  snapshotsLoading?: boolean;
  className?: string;
};

function personMatchesSearch(p: Person, q: string): boolean {
  if (!q) return true;
  const hay = [
    p.full_name,
    p.email,
    p.unit,
    p.team,
    p.position,
    p.hr_structure,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function isUnassignedHr(p: Person): boolean {
  return !p.unit?.trim() || !p.team?.trim();
}

const FILTER_LABELS: Record<DirectoryFilter, string> = {
  all: 'Все',
  pending: 'На проверке',
  unassigned: 'Без Unit/Team',
  roster_conflicts: 'Конфликт составов',
};

export function AdminPeopleDirectoryFullView({
  people,
  snapshots,
  snapshotsLoading,
  className,
}: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DirectoryFilter>('all');

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);

  const conflictIds = useMemo(
    () => findAllRosterConflictingPersonIds(snapshots, peopleById),
    [snapshots, peopleById]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = people.filter((p) => personMatchesSearch(p, q));

    if (filter === 'pending') {
      list = list.filter(isManualPendingReview);
    } else if (filter === 'unassigned') {
      list = list.filter(isUnassignedHr);
    } else if (filter === 'roster_conflicts') {
      list = list.filter((p) => conflictIds.has(p.id));
    }

    return [...list].sort((a, b) => {
      const ap = isManualPendingReview(a) ? 0 : 1;
      const bp = isManualPendingReview(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.full_name.localeCompare(b.full_name, 'ru');
    });
  }, [people, search, filter, conflictIds]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6', className)}>
      <div className="shrink-0 space-y-1">
        <h2 className="font-juneau text-lg font-medium tracking-tight">Справочник людей</h2>
        <p className="text-sm text-muted-foreground">
          Полный список записей из базы без привязки к фильтру Unit/Team на этой странице. Ручные
          добавления и конфликты составов по снимкам команд можно отфильтровать ниже.
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Поиск по имени, email, юниту, команде…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FILTER_LABELS) as DirectoryFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                filter === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/60'
              )}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {snapshotsLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка снимков составов для проверки конфликтов…</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/80 bg-card">
        <div className="h-full overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {people.length === 0
                ? 'В базе пока нет людей.'
                : 'Никто не подходит под текущий поиск и фильтр.'}
            </p>
          ) : (
            <PeopleDirectoryRows people={filtered} />
          )}
        </div>
      </div>

      <p className="shrink-0 text-[11px] text-muted-foreground">
        Показано: {filtered.length} из {people.length}
        {filter === 'roster_conflicts' && conflictIds.size === 0 && !snapshotsLoading
          ? ' · Конфликтов по снимкам не найдено'
          : null}
      </p>
    </div>
  );
}
