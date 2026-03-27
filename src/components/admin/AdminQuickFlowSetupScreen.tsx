import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Building2, Users, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTeamsForUnits } from '@/lib/adminDataManager';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { cn } from '@/lib/utils';
import { usePeople } from '@/hooks/usePeople';
import {
  useTeamSnapshots,
  getEffectiveTeamMembers,
  compareQuarters,
  getCurrentQuarter,
} from '@/hooks/useTeamSnapshots';

function pickReferenceQuarter(quarters: string[]): string {
  if (quarters.length === 0) return getCurrentQuarter();
  return [...quarters].sort(compareQuarters).at(-1)!;
}

type Props = {
  units: string[];
  quarters: string[];
  rawData: AdminDataRow[];
  memberUnit: string | null;
  memberTeam: string | null;
  onBack: () => void;
  onStart: (unit: string, teamsInOrder: string[], quarter: string) => void;
};

export function AdminQuickFlowSetupScreen({
  units,
  quarters,
  rawData,
  memberUnit,
  memberTeam,
  onBack,
  onStart,
}: Props) {
  const [unitChoice, setUnitChoice] = useState<string>(() => memberUnit?.trim() || units[0] || '');
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [focusedTeam, setFocusedTeam] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => pickReferenceQuarter(quarters));

  const { data: people = [], isLoading: peopleLoading } = usePeople();

  const teamsForUnit = useMemo(
    () => (unitChoice ? getTeamsForUnits(rawData, [unitChoice]) : []),
    [rawData, unitChoice]
  );

  const { data: snapshots = [] } = useTeamSnapshots(
    unitChoice ? [unitChoice] : [],
    teamsForUnit
  );

  const sortedQuarters = useMemo(() => [...quarters].sort(compareQuarters), [quarters]);
  const referenceQuarter = selectedQuarter;

  const selectedSet = useMemo(() => new Set(teamOrder), [teamOrder]);

  const teamsAndRosterActive = !!unitChoice.trim();

  const roster = useMemo(() => {
    if (!teamsAndRosterActive || !unitChoice || focusedTeam === null) return [];
    return getEffectiveTeamMembers(
      unitChoice,
      focusedTeam,
      referenceQuarter,
      snapshots,
      people,
      sortedQuarters
    ).people;
  }, [
    teamsAndRosterActive,
    unitChoice,
    focusedTeam,
    referenceQuarter,
    snapshots,
    people,
    sortedQuarters,
  ]);

  const selectUnit = useCallback(
    (u: string) => {
      setUnitChoice(u);
      const allowed = new Set(getTeamsForUnits(rawData, [u]));
      setTeamOrder((prev) => prev.filter((team) => allowed.has(team)));
      setFocusedTeam((prev) => (prev && allowed.has(prev) ? prev : null));
    },
    [rawData]
  );

  const toggleTeamSelection = useCallback((t: string) => {
    setTeamOrder((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      setFocusedTeam(t);
      return next;
    });
  }, []);

  const canStart = teamOrder.length > 0;

  return (
    <div className="min-h-0 flex-1 flex flex-col bg-gradient-to-b from-muted/40 via-background to-background overflow-hidden">
      <div className="w-full h-full px-4 sm:px-6 py-6 flex flex-col gap-4 min-h-0">
        <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5 -ml-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>

        <header className="space-y-2 text-center sm:text-left shrink-0">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Заполнение по шагам</p>
          <h1 className="font-juneau font-medium text-2xl sm:text-3xl tracking-tight text-balance">Настроим контекст</h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <p className="text-sm text-muted-foreground text-balance max-w-3xl mx-auto sm:mx-0">
              Юнит, команды и состав на квартал <span className="font-medium text-foreground">{referenceQuarter}</span>.
              По каждой выбранной команде — шаги заполнения отдельно.
            </p>
            <div className="w-full sm:w-[260px] shrink-0">
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите квартал" />
                </SelectTrigger>
                <SelectContent>
                  {sortedQuarters.length > 0 ? (
                    [...sortedQuarters].reverse().map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={getCurrentQuarter()}>{getCurrentQuarter()}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden flex-1 min-h-0">
              {/* Column: units */}
              <div className="flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Юнит</span>
                </div>
                <ScrollArea className="flex-1 min-h-[220px] lg:min-h-0">
                  <div className="p-2 space-y-1">
                    {units.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => selectUnit(u)}
                        className={cn(
                          'w-full text-left rounded-lg px-4 py-3 text-base font-medium transition-colors',
                          unitChoice === u
                            ? 'bg-primary/15 text-primary'
                            : 'hover:bg-muted/80 text-foreground'
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Column: teams */}
              <div
                className={cn(
                  'flex flex-col min-h-0 border-t lg:border-t-0',
                  !teamsAndRosterActive && 'opacity-60 pointer-events-none'
                )}
              >
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Команды</span>
                </div>
                <div className="px-4 py-2 text-xs text-muted-foreground shrink-0">
                  {memberTeam?.trim() && teamsForUnit.includes(memberTeam.trim())
                    ? 'Ваша команда отмечена. Порядок отметок = порядок прохождения.'
                    : 'Выберите одну или несколько. Порядок отметок = порядок прохождения.'}
                </div>
                <ScrollArea className="flex-1 min-h-[220px] lg:min-h-0">
                  {!unitChoice ? (
                    <p className="text-sm text-muted-foreground p-4">Сначала выберите юнит слева.</p>
                  ) : teamsForUnit.length === 0 ? (
                    <p className="text-sm text-foreground bg-primary/10 border border-primary/15 rounded-lg p-3 m-2">
                      Нет команд в данных. Создайте инициативы в полной таблице.
                    </p>
                  ) : (
                    <div className="p-2 space-y-1">
                      {teamsForUnit.map((t) => {
                        const selected = selectedSet.has(t);
                        const focus = focusedTeam === t;
                        return (
                          <button
                            key={t || '_empty'}
                            type="button"
                            onClick={() => toggleTeamSelection(t)}
                            className={cn(
                              'w-full text-left flex items-center gap-3 rounded-lg px-4 py-3 text-base transition-colors',
                              selected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted/80',
                              focus && !selected ? 'ring-1 ring-border' : ''
                            )}
                          >
                            <span className="font-medium flex-1">{t || '—'}</span>
                            {selected && (
                              <span className="text-xs tabular-nums text-primary/80 shrink-0">
                                {teamOrder.indexOf(t) + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Column: roster */}
              <div
                className={cn(
                  'flex flex-col min-h-0 border-t lg:border-t-0',
                  !teamsAndRosterActive && 'opacity-60 pointer-events-none'
                )}
              >
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Состав команды</span>
                </div>
                <div className="px-4 py-2 text-xs text-muted-foreground shrink-0">
                  На квартал {referenceQuarter}. Нажмите на название команды — справа появится состав.
                </div>
                <ScrollArea className="flex-1 min-h-[220px] lg:min-h-0">
                  {!unitChoice ? (
                    <p className="text-sm text-muted-foreground p-4">
                      Сначала выберите юнит слева.
                    </p>
                  ) : !focusedTeam ? (
                    <p className="text-sm text-muted-foreground p-4">
                      Нажмите на команду в средней колонке — здесь появится список людей.
                    </p>
                  ) : peopleLoading ? (
                    <p className="text-sm text-muted-foreground p-4">Загрузка…</p>
                  ) : roster.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4">
                      Нет людей в составе для этой команды на выбранный квартал.
                    </p>
                  ) : (
                    <ul className="p-2 space-y-0.5">
                      {roster.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-lg px-3 py-2 text-sm border border-transparent hover:bg-muted/50"
                        >
                          <span className="font-medium">{p.full_name}</span>
                          {p.email ? (
                            <span className="block text-xs text-muted-foreground truncate">{p.email}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1 shrink-0">
            <Button
              className="sm:w-auto"
              disabled={!canStart}
              onClick={() => onStart(unitChoice, teamOrder, selectedQuarter)}
            >
              Начать заполнение
              {teamOrder.length > 1 && (
                <span className="ml-1.5 text-xs opacity-90">({teamOrder.length})</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
