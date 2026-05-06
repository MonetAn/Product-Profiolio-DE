import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, UserMinus, UserPlus } from 'lucide-react';
import { RosterAddPeopleDialog } from '@/components/admin/RosterAddPeopleDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

type Props = {
  unit: string;
  team: string;
  quartersCatalog: string[];
  compactChrome?: boolean;
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

export function AdminQuickFlowRosterStep({ unit, team, quartersCatalog, compactChrome = false }: Props) {
  const { toast } = useToast();
  const quarter = getCurrentQuarter();

  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const { data: snapshots = [], isLoading: snapLoading } = useTeamSnapshots(
    unit.trim() ? [unit.trim()] : [],
    []
  );
  const loading = peopleLoading || snapLoading;
  const { upsertRosterSnapshot } = useSnapshotMutations();

  const sortedCatalog = useMemo(
    () => [...quartersCatalog].filter((q) => q && QUARTER_KEY.test(q)).sort(compareQuarters),
    [quartersCatalog]
  );

  /** Черновик списка id для текущего квартала; иначе берём из снимка / эффективного состава */
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  /** Если в БД нет колонок подтверждения — имя/время сохранения в этой сессии */
  const [sessionRosterSaved, setSessionRosterSaved] = useState<{ at: string; name: string } | null>(null);

  useEffect(() => {
    setSessionRosterSaved(null);
    setDraftIds(null);
  }, [unit, team]);

  const catalogForEffective = sortedCatalog.length > 0 ? sortedCatalog : [quarter];

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);

  const baselineIds = useMemo(
    () => deriveDefaultIds(unit, team, quarter, snapshots, people, catalogForEffective),
    [unit, team, quarter, snapshots, people, catalogForEffective]
  );

  const workingIds = draftIds ?? baselineIds;

  const conflicts = useMemo(
    () => findRosterConflictsForUnitQuarter(unit, quarter, snapshots, peopleById),
    [unit, quarter, snapshots, peopleById]
  );

  const snap = snapshotFor(snapshots, unit, team, quarter);
  const isDirty = !sameIdSet(workingIds, baselineIds);

  const serverRosterConfirmed = Boolean(snap?.roster_confirmed_at && String(snap.roster_confirmed_at).trim() !== '');
  const sessionRosterConfirmed = Boolean(sessionRosterSaved?.at);
  const rosterMarkedConfirmed = serverRosterConfirmed || sessionRosterConfirmed;
  const canSaveComposition =
    Boolean(unit.trim() && team.trim()) &&
    !loading &&
    conflicts.length === 0 &&
    (isDirty || !snap || !rosterMarkedConfirmed);

  const workingPeople = useMemo(() => {
    return workingIds.map((id) => peopleById.get(id)).filter(Boolean) as Person[];
  }, [workingIds, peopleById]);

  const [addPeopleDialogOpen, setAddPeopleDialogOpen] = useState(false);
  const rosterExcludeIds = useMemo(() => new Set(workingIds), [workingIds]);

  const setWorkingIds = (ids: string[]) => {
    setDraftIds(ids);
  };

  const handleSave = async () => {
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
        quarter,
        person_ids: workingIds,
      });
      setSessionRosterSaved({ at: displayAt, name: displayName });
      setDraftIds(null);
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

  const removePerson = (id: string) => {
    const next = workingIds.filter((x) => x !== id);
    setWorkingIds(next);
  };

  const addPerson = (p: Person) => {
    if (workingIds.includes(p.id)) return;
    setWorkingIds([...workingIds, p.id]);
  };

  const saveDisabledReason = loading
    ? 'Загрузка данных…'
    : conflicts.length > 0
      ? 'Сначала устраните конфликт составов в юните'
      : !unit.trim() || !team.trim()
        ? 'Не выбраны юнит и команда'
        : !canSaveComposition
          ? 'Нет изменений и состав уже отмечен как сохранённый'
          : '';

  const confirmedAt = snap?.roster_confirmed_at || sessionRosterSaved?.at || null;
  const confirmedName = snap?.roster_confirmed_by_name || sessionRosterSaved?.name || null;
  const shortWhen =
    confirmedAt &&
    new Date(confirmedAt).toLocaleString('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {!compactChrome ? (
        <header>
          <h1 className="font-juneau text-xl font-medium tracking-tight sm:text-2xl">
            Состав команды · <span className="tabular-nums">{quarter}</span>
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-snug text-muted-foreground sm:text-base">
            Проверь состав команды
          </p>
        </header>
      ) : null}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-border/80 bg-card p-3 shadow-sm sm:p-4',
          'min-h-[min(22rem,48vh)]'
        )}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {rosterMarkedConfirmed && confirmedAt ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/90">{confirmedName ?? '—'}</span>
                {shortWhen ? <> · {shortWhen}</> : null}
              </p>
            ) : (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Состав ещё не отмечен как сохранённый за {quarter}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={!canSaveComposition || upsertRosterSnapshot.isPending}
            title={!canSaveComposition && !upsertRosterSnapshot.isPending ? saveDisabledReason : undefined}
            onClick={() => void handleSave()}
          >
            Сохранить состав
          </Button>
        </div>

        <div className="shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading || !unit.trim() || !team.trim()}
            onClick={() => setAddPeopleDialogOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Добавить человека
          </Button>
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
                  {c.personName} указан в командах: {c.teams.join(', ')}. Согласуйте вручную, затем сохраните
                  состав.
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

        <RosterAddPeopleDialog
          open={addPeopleDialogOpen}
          onOpenChange={setAddPeopleDialogOpen}
          people={people}
          excludePersonIds={rosterExcludeIds}
          loading={loading}
          quarterLabel={quarter}
          onAddPerson={(p) => addPerson(p)}
        />
      </div>
    </section>
  );
}
