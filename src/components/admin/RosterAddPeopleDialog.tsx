import { useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { isManualPendingReview, type Person } from '@/lib/peopleDataManager';

const ROSTER_ADD_LIST_LIMIT = 500;

function normalizeRosterAddSearchString(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function personMatchesRosterAddQuery(p: Person, rawQuery: string): boolean {
  const q = normalizeRosterAddSearchString(rawQuery);
  if (!q) return true;
  const hay = normalizeRosterAddSearchString([p.full_name, p.email].filter(Boolean).join(' '));
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => hay.includes(t));
}

function rosterAddMatchSubtitle(p: Person): string | null {
  const bits: string[] = [];
  if (p.email?.trim()) bits.push(p.email.trim());
  const loc = [p.unit, p.team].filter(Boolean).join(' · ');
  if (loc) bits.push(loc);
  return bits.length ? bits.join(' · ') : null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  /** Уже в составе выбранного квартала — в списке не показываем */
  excludePersonIds: Set<string>;
  loading?: boolean;
  /** Подставляется в текст (календарный квартал состава) */
  quarterLabel?: string;
  onAddPerson: (p: Person) => void;
};

export function RosterAddPeopleDialog({
  open,
  onOpenChange,
  people,
  excludePersonIds,
  loading = false,
  quarterLabel,
  onAddPerson,
}: Props) {
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    return people
      .filter((p) => !p.terminated_at)
      .filter((p) => !excludePersonIds.has(p.id))
      .filter((p) => personMatchesRosterAddQuery(p, query))
      .sort((a, b) => {
        const ap = isManualPendingReview(a) ? 0 : 1;
        const bp = isManualPendingReview(b) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.full_name.localeCompare(b.full_name, 'ru');
      })
      .slice(0, ROSTER_ADD_LIST_LIMIT);
  }, [people, excludePersonIds, query]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(100vw-1.5rem,48rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 pb-4 pr-12 pt-6">
          <DialogTitle>Найти и добавить</DialogTitle>
          <DialogDescription>
            Поиск по ФИО или email. Добавьте человека из справочника в состав команды
            {quarterLabel ? (
              <>
                {' '}
                за квартал <span className="font-medium text-foreground tabular-nums">{quarterLabel}</span>.
              </>
            ) : (
              '.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="ФИО или email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Поиск по ФИО и email"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="h-[min(52vh,420px)] px-2 py-2">
          <ul className="divide-y divide-border/60 px-2" role="listbox" aria-label="Сотрудники">
            {loading ? (
              <li className="p-4 text-sm text-muted-foreground">Загрузка…</li>
            ) : candidates.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                {query.trim()
                  ? 'Никого не найдено. Проверьте ФИО или email.'
                  : 'Нет доступных для добавления записей (все уже в составе или нет активных сотрудников).'}
              </li>
            ) : (
              candidates.map((p) => {
                const sub = rosterAddMatchSubtitle(p);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 px-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    role="option"
                  >
                    <div className="min-w-0 w-full flex-1 sm:w-auto">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="min-w-0 break-words font-medium">{p.full_name}</span>
                        {isManualPendingReview(p) ? (
                          <Badge className="shrink-0 text-[9px] font-normal">на проверке</Badge>
                        ) : null}
                      </div>
                      {sub ? (
                        <div
                          className="mt-0.5 break-words text-[11px] text-muted-foreground sm:line-clamp-2 sm:max-w-[min(100%,28rem)]"
                          title={sub}
                        >
                          {sub}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full shrink-0 gap-1 sm:w-auto"
                      aria-label={`Добавить ${p.full_name}`}
                      onClick={() => {
                        onAddPerson(p);
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden />
                      Добавить
                    </Button>
                  </li>
                );
              })
            )}
          </ul>
        </ScrollArea>

        <div className="shrink-0 border-t border-border px-6 py-3">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => handleOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
