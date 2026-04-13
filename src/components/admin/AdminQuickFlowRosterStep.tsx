import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Check, Copy, Search, UserMinus, UserPlus } from 'lucide-react';
import PersonCreateDialog from '@/components/admin/people/PersonCreateDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getEffectiveTeamMembers,
  normalizeSnapshotPersonIds,
  useSnapshotMutations,
  useTeamSnapshots,
  type TeamSnapshot,
} from '@/hooks/useTeamSnapshots';
import { usePeople } from '@/hooks/usePeople';
import { useToast } from '@/hooks/use-toast';
import { isManualPendingReview, type Person } from '@/lib/peopleDataManager';
import { findRosterConflictsForUnitQuarter } from '@/lib/rosterQuarterUtils';
import { compareQuarters, getCurrentQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

const QUARTER_KEY = /^\d{4}-Q[1-4]$/;

const ROSTER_ADD_MATCH_LIMIT = 80;

function formatPersonTenureLine(p: Person): string | null {
  const parts: string[] = [];
  if (p.hired_at) {
    parts.push(
      `Найм: ${new Date(p.hired_at).toLocaleDateString('ru-RU', { dateStyle: 'short' })}`
    );
  }
  if (p.terminated_at) {
    parts.push(
      `Уволен: ${new Date(p.terminated_at).toLocaleDateString('ru-RU', { dateStyle: 'short' })}`
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function normalizeRosterAddSearchString(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/**
 * Поиск только по ФИО и email (quick flow «Состав команды»).
 * Несколько слов через пробел — все должны встретиться в объединённой строке (как «Иванов Иван»).
 */
function personMatchesRosterAddQuery(p: Person, rawQuery: string): boolean {
  const q = normalizeRosterAddSearchString(rawQuery);
  if (!q) return false;
  const hay = normalizeRosterAddSearchString([p.full_name, p.email].filter(Boolean).join(' '));
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
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
  unit: string;
  team: string;
  fillQuarters: string[];
  quartersCatalog: string[];
  onAllQuartersConfirmedChange?: (allSaved: boolean) => void;
};

function snapshotFor(
  snapshots: TeamSnapshot[],
  unit: string,
  team: string,
  quarter: string
): TeamSnapshot | undefined {
  return snapshots.find((s) => s.unit === unit && s.team === team && s.quarter === quarter);
}

function deriveDefaultIds(
  unit: string,
  team: string,
  quarter: string,
  snapshots: TeamSnapshot[],
  people: Person[],
  quartersCatalog: string[]
): string[] {
  const snap = snapshotFor(snapshots, unit, team, quarter);
  if (snap) return [...normalizeSnapshotPersonIds(snap.person_ids)];
  const { people: eff } = getEffectiveTeamMembers(unit, team, quarter, snapshots, people, quartersCatalog);
  return eff.map((p) => p.id);
}

export function AdminQuickFlowRosterStep({
  unit,
  team,
  fillQuarters,
  quartersCatalog,
  onAllQuartersConfirmedChange,
}: Props) {
  const { toast } = useToast();
  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const { data: snapshots = [], isLoading: snapLoading } = useTeamSnapshots(
    unit.trim() ? [unit.trim()] : [],
    []
  );
  const loading = peopleLoading || snapLoading;
  const { upsertRosterSnapshot } = useSnapshotMutations();

  const scenarioSet = useMemo(() => new Set(fillQuarters.filter(Boolean)), [fillQuarters]);

  const sortedCatalog = useMemo(
    () => [...quartersCatalog].filter((q) => q && QUARTER_KEY.test(q)).sort(compareQuarters),
    [quartersCatalog]
  );

  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => {
    const cur = getCurrentQuarter();
    const firstFromCurrent = sortedCatalog.find((q) => compareQuarters(q, cur) >= 0);
    return firstFromCurrent ?? sortedCatalog[0] ?? '';
  });

  useEffect(() => {
    if (sortedCatalog.length === 0) {
      setSelectedQuarter('');
      return;
    }
    if (!selectedQuarter || !sortedCatalog.includes(selectedQuarter)) {
      const cur = getCurrentQuarter();
      const firstFromCurrent = sortedCatalog.find((q) => compareQuarters(q, cur) >= 0);
      setSelectedQuarter(firstFromCurrent ?? sortedCatalog[0]);
    }
  }, [sortedCatalog, selectedQuarter]);

  const [draftOverrides, setDraftOverrides] = useState<Record<string, string[]>>({});
  /** Если в БД нет колонок подтверждения или ответ без них — показываем имя/время сохранения в этой сессии. */
  const [localRosterConfirmByQuarter, setLocalRosterConfirmByQuarter] = useState<
    Record<string, { at: string; name: string }>
  >({});

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);

  const getWorkingIds = useCallback(
    (q: string) => {
      if (draftOverrides[q]) return draftOverrides[q];
      return deriveDefaultIds(unit, team, q, snapshots, people, quartersCatalog);
    },
    [draftOverrides, unit, team, snapshots, people, quartersCatalog]
  );

  const conflicts = useMemo(
    () =>
      selectedQuarter
        ? findRosterConflictsForUnitQuarter(unit, selectedQuarter, snapshots, peopleById)
        : [],
    [unit, selectedQuarter, snapshots, peopleById]
  );

  const snap = selectedQuarter ? snapshotFor(snapshots, unit, team, selectedQuarter) : undefined;
  const workingIds = selectedQuarter ? getWorkingIds(selectedQuarter) : [];
  const baselineIds = useMemo(() => {
    if (!selectedQuarter) return [];
    return deriveDefaultIds(unit, team, selectedQuarter, snapshots, people, quartersCatalog);
  }, [selectedQuarter, unit, team, snapshots, people, quartersCatalog]);
  const isDirty = selectedQuarter ? !sameIdSet(workingIds, baselineIds) : false;

  /** Можно сохранить первый снимок, подтвердить состав без смены списка, или записать изменения. */
  const serverRosterConfirmed = Boolean(snap?.roster_confirmed_at && String(snap.roster_confirmed_at).trim() !== '');
  const sessionRosterConfirmed = Boolean(
    selectedQuarter && localRosterConfirmByQuarter[selectedQuarter]?.at
  );
  const rosterMarkedConfirmed = serverRosterConfirmed || sessionRosterConfirmed;
  const canSaveComposition =
    Boolean(selectedQuarter) &&
    !loading &&
    conflicts.length === 0 &&
    (isDirty || !snap || !rosterMarkedConfirmed);

  const workingPeople = useMemo(() => {
    return workingIds.map((id) => peopleById.get(id)).filter(Boolean) as Person[];
  }, [workingIds, peopleById]);

  const calendarCurrent = getCurrentQuarter();

  const allSavedFromCurrent = useMemo(() => {
    const relevant = sortedCatalog.filter((q) => compareQuarters(q, calendarCurrent) >= 0);
    if (relevant.length === 0) return true;
    return relevant.every((q) => {
      const s = snapshotFor(snapshots, unit, team, q);
      const local = localRosterConfirmByQuarter[q];
      const fromServer = s?.roster_confirmed_at != null && s.roster_confirmed_at !== '';
      const fromSession = Boolean(local?.at);
      return fromServer || fromSession;
    });
  }, [sortedCatalog, snapshots, unit, team, calendarCurrent, localRosterConfirmByQuarter]);

  useEffect(() => {
    onAllQuartersConfirmedChange?.(allSavedFromCurrent);
  }, [allSavedFromCurrent, onAllQuartersConfirmedChange]);

  const [addSearch, setAddSearch] = useState('');
  const [searchPickOpen, setSearchPickOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [createPersonOpen, setCreatePersonOpen] = useState(false);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!searchContainerRef.current?.contains(e.target as Node)) setSearchPickOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const addMatches = useMemo(() => {
    const raw = addSearch.trim();
    if (!raw) return [];
    const set = new Set(workingIds);
    const qNorm = normalizeRosterAddSearchString(raw);
    const firstToken = qNorm.split(' ')[0] ?? '';
    return people
      .filter((p) => !p.terminated_at)
      .filter((p) => !set.has(p.id))
      .filter((p) => personMatchesRosterAddQuery(p, raw))
      .sort((a, b) => {
        const ap = isManualPendingReview(a) ? 0 : 1;
        const bp = isManualPendingReview(b) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const na = normalizeRosterAddSearchString(a.full_name);
        const nb = normalizeRosterAddSearchString(b.full_name);
        const aStarts = Boolean(firstToken && na.startsWith(firstToken));
        const bStarts = Boolean(firstToken && nb.startsWith(firstToken));
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.full_name.localeCompare(b.full_name, 'ru');
      })
      .slice(0, ROSTER_ADD_MATCH_LIMIT);
  }, [people, workingIds, addSearch]);

  /** Следующий квартал в каталоге после выбранного (для копирования состава на один шаг вперёд). */
  const nextQuarterAfterSelected = useMemo(() => {
    if (!selectedQuarter) return null;
    return sortedCatalog.find((q) => compareQuarters(q, selectedQuarter) > 0) ?? null;
  }, [sortedCatalog, selectedQuarter]);

  const setQuarterIds = (q: string, ids: string[]) => {
    setDraftOverrides((prev) => ({ ...prev, [q]: ids }));
  };

  const handleSave = async () => {
    if (!selectedQuarter) return;
    if (conflicts.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Есть конфликт составов',
        description: 'Согласуйте пересечения с другими командами, затем сохраните состав.',
      });
      return;
    }
    try {
      const { displayAt, displayName } = await upsertRosterSnapshot.mutateAsync({
        unit,
        team,
        quarter: selectedQuarter,
        person_ids: workingIds,
      });
      setLocalRosterConfirmByQuarter((prev) => ({
        ...prev,
        [selectedQuarter]: { at: displayAt, name: displayName },
      }));
      setDraftOverrides(({ [selectedQuarter]: _removed, ...rest }) => rest);
      toast({
        title: 'Состав сохранён',
        description: `${displayName} · ${new Date(displayAt).toLocaleString('ru-RU', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}`,
      });
    } catch {
      /* ошибка уже в onError мутации */
    }
  };

  const handleCopyToNextQuarter = async () => {
    if (!selectedQuarter || !nextQuarterAfterSelected) return;
    const ids = [...workingIds];
    const target = nextQuarterAfterSelected;
    try {
      const { displayAt, displayName } = await upsertRosterSnapshot.mutateAsync({
        unit,
        team,
        quarter: target,
        person_ids: ids,
      });
      setLocalRosterConfirmByQuarter((prev) => ({
        ...prev,
        [target]: { at: displayAt, name: displayName },
      }));
      setDraftOverrides((prev) => {
        const { [target]: _t, ...rest } = prev;
        return rest;
      });
      toast({
        title: 'Состав скопирован',
        description: `Квартал ${target} · ${displayName}`,
      });
    } catch {
      /* toast в mutation */
    }
  };

  const removePerson = (id: string) => {
    if (!selectedQuarter) return;
    const next = workingIds.filter((x) => x !== id);
    setQuarterIds(selectedQuarter, next);
  };

  const addPerson = (p: Person) => {
    if (!selectedQuarter) return;
    if (workingIds.includes(p.id)) return;
    setQuarterIds(selectedQuarter, [...workingIds, p.id]);
  };

  if (sortedCatalog.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        В выгрузке нет кварталов в формате YYYY-Qn. Проверьте данные или импорт.
      </section>
    );
  }

  const saveDisabledReason = loading
    ? 'Загрузка данных…'
    : conflicts.length > 0
      ? 'Сначала устраните конфликт составов в юните'
      : !selectedQuarter
        ? 'Выберите квартал'
        : !canSaveComposition
          ? 'Нет изменений и состав уже отмечен как сохранённый для этого квартала'
          : '';

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <header>
        <h1 className="font-juneau text-xl font-medium tracking-tight sm:text-2xl">
          Состав команды по кварталам
        </h1>
        <p className="mt-1.5 text-sm font-medium leading-snug text-muted-foreground sm:text-base">
          Проверь каждый квартал и сохрани состав команды
        </p>
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm',
          'lg:grid lg:min-h-[min(26rem,52vh)] lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-stretch lg:divide-x lg:divide-border'
        )}
      >
        <aside className="flex min-h-0 flex-col border-b border-border lg:min-h-0 lg:border-b-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Кварталы</span>
          </div>
          <ScrollArea className="h-44 min-h-0 flex-1 lg:h-full lg:max-h-none">
            <div className="space-y-1 p-2">
              {sortedCatalog.map((q) => {
                const s = snapshotFor(snapshots, unit, team, q);
                const local = localRosterConfirmByQuarter[q];
                const confirmedAt = s?.roster_confirmed_at || local?.at || null;
                const confirmedName = s?.roster_confirmed_by_name || local?.name || null;
                const saved = Boolean(confirmedAt);
                const sel = q === selectedQuarter;
                const isPast = compareQuarters(q, calendarCurrent) < 0;
                const inScenario = scenarioSet.has(q);
                const shortWhen =
                  confirmedAt &&
                  new Date(confirmedAt).toLocaleString('ru-RU', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  });
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuarter(q)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      sel ? 'bg-primary/15 text-primary' : 'hover:bg-muted/80 text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium tabular-nums">
                      <span>{q}</span>
                      {inScenario ? (
                        <span
                          className="rounded bg-muted px-1.5 py-px text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                          title="Входит в интервал сценария"
                        >
                          сценарий
                        </span>
                      ) : null}
                      {saved ? (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {saved ? (
                        <>
                          <span className="text-foreground/90">{confirmedName ?? '—'}</span>
                          {shortWhen ? <> · {shortWhen}</> : null}
                        </>
                      ) : isPast ? (
                        <span>Не сохраняли (прошлый период)</span>
                      ) : (
                        <span className="font-medium text-amber-700 dark:text-amber-300">
                          Нет сохранения
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:p-4">
          {selectedQuarter ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tabular-nums">{selectedQuarter}</h2>
                <div className="flex flex-wrap items-center gap-1">
                  {nextQuarterAfterSelected ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs font-normal text-muted-foreground"
                      disabled={upsertRosterSnapshot.isPending || loading}
                      title={`Скопировать состав в ${nextQuarterAfterSelected}`}
                      onClick={() => void handleCopyToNextQuarter()}
                    >
                      <Copy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                      В {nextQuarterAfterSelected}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!canSaveComposition || upsertRosterSnapshot.isPending}
                    title={!canSaveComposition && !upsertRosterSnapshot.isPending ? saveDisabledReason : undefined}
                    onClick={() => void handleSave()}
                  >
                    Сохранить состав
                  </Button>
                </div>
              </div>

              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCreatePersonOpen(true)}
                  >
                    Новый человек
                  </Button>
                </div>
                <div ref={searchContainerRef} className="relative z-20">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="ФИО или email…"
                    value={addSearch}
                    onChange={(e) => {
                      setAddSearch(e.target.value);
                      setSearchPickOpen(true);
                    }}
                    onFocus={() => setSearchPickOpen(true)}
                    aria-label="Поиск по ФИО и email для добавления в состав"
                    aria-expanded={searchPickOpen && addSearch.trim().length > 0}
                    aria-controls="roster-add-search-results"
                  />
                  {searchPickOpen && addSearch.trim() ? (
                    <div
                      id="roster-add-search-results"
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-0.5 text-popover-foreground shadow-md [-webkit-overflow-scrolling:touch]"
                    >
                      <ul className="divide-y divide-border/60">
                        {addMatches.length === 0 ? (
                          <li className="p-3 text-sm text-muted-foreground">
                            Никого не найдено. Проверьте ФИО или email.
                          </li>
                        ) : (
                          addMatches.map((p) => {
                            const sub = rosterAddMatchSubtitle(p);
                            return (
                              <li
                                key={p.id}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="truncate font-medium">{p.full_name}</span>
                                    {isManualPendingReview(p) ? (
                                      <Badge className="shrink-0 text-[9px] font-normal">на проверке</Badge>
                                    ) : null}
                                  </div>
                                  {sub ? (
                                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={sub}>
                                      {sub}
                                    </div>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0"
                                  aria-label={`Добавить ${p.full_name}`}
                                  onClick={() => {
                                    addPerson(p);
                                    setAddSearch('');
                                    setSearchPickOpen(false);
                                  }}
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              {conflicts.length > 0 ? (
                <div
                  className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                  role="status"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    Конфликт составов в юните
                  </div>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs opacity-95">
                    {conflicts.map((c) => (
                      <li key={c.personId}>
                        {c.personName} указан в командах: {c.teams.join(', ')}. Согласуйте вручную, затем
                        сохраните состав.
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
                <p className="shrink-0 text-xs font-medium text-muted-foreground">
                  Состав ({workingPeople.length})
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border/80 [-webkit-overflow-scrolling:touch] [touch-action:pan-y]">
                  <ul className="divide-y divide-border/60 p-1">
                    {loading ? (
                      <li className="p-3 text-sm text-muted-foreground">Загрузка…</li>
                    ) : workingPeople.length === 0 ? (
                      <li className="p-3 text-sm text-muted-foreground">В составе пока никого</li>
                    ) : (
                      workingPeople.map((p) => {
                        const tenure = formatPersonTenureLine(p);
                        return (
                          <li
                            key={p.id}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate font-medium">{p.full_name}</span>
                                {isManualPendingReview(p) ? (
                                  <Badge variant="outline" className="text-[9px] font-normal">
                                    на проверке у админа
                                  </Badge>
                                ) : null}
                              </div>
                              {tenure ? (
                                <div className="mt-0.5 text-xs text-muted-foreground">{tenure}</div>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={`Убрать ${p.full_name}`}
                              onClick={() => removePerson(p.id)}
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>

              <PersonCreateDialog
                open={createPersonOpen}
                onOpenChange={setCreatePersonOpen}
                defaultUnit={unit}
                defaultTeam={team}
                rosterMode
                onPersonCreated={(p) => addPerson(p)}
              />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
