import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTeamsForUnits } from '@/lib/adminDataManager';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { cn } from '@/lib/utils';

type Props = {
  units: string[];
  rawData: AdminDataRow[];
  memberUnit: string | null;
  onStart: (unit: string, teamsInOrder: string[]) => void;
  onTeamsOrderChange?: (teamCount: number) => void;
  stepTrack?: ReactNode;
};

export function AdminQuickFlowSetupScreen({
  units,
  rawData,
  memberUnit,
  onStart,
  onTeamsOrderChange,
  stepTrack,
}: Props) {
  const [unitChoice, setUnitChoice] = useState<string>(() => memberUnit?.trim() || units[0] || '');
  const [teamOrder, setTeamOrder] = useState<string[]>([]);

  useEffect(() => {
    onTeamsOrderChange?.(teamOrder.length);
  }, [teamOrder.length, onTeamsOrderChange]);

  const teamsForUnit = useMemo(
    () => (unitChoice ? getTeamsForUnits(rawData, [unitChoice]) : []),
    [rawData, unitChoice]
  );

  const selectedSet = useMemo(() => new Set(teamOrder), [teamOrder]);

  const teamsAndRosterActive = !!unitChoice.trim();

  const selectUnit = useCallback(
    (u: string) => {
      setUnitChoice(u);
      const allowed = new Set(getTeamsForUnits(rawData, [u]));
      setTeamOrder((prev) => prev.filter((team) => allowed.has(team)));
    },
    [rawData]
  );

  const toggleTeamSelection = useCallback((t: string) => {
    setTeamOrder((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      return next;
    });
  }, []);

  const canStart = teamOrder.length > 0;

  return (
    <div className="min-h-0 flex-1 flex flex-col bg-gradient-to-b from-muted/40 via-background to-background overflow-hidden">
      <div className="w-full h-full max-w-none mx-auto px-4 sm:px-5 lg:px-8 py-4 flex flex-col gap-3 min-h-0">
        {stepTrack ? <div className="shrink-0">{stepTrack}</div> : null}

        <header className="shrink-0">
          <h1 className="font-juneau font-medium text-xl sm:text-2xl tracking-tight text-balance">
            Выберите юнит и команды
          </h1>
        </header>

        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-border rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden flex-1 min-h-0">
            <div className="flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Юнит</span>
              </div>
              <ScrollArea className="flex-1 min-h-[200px] lg:min-h-0">
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
              <ScrollArea className="flex-1 min-h-[200px] lg:min-h-0">
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
                      return (
                        <button
                          key={t || '_empty'}
                          type="button"
                          onClick={() => toggleTeamSelection(t)}
                          className={cn(
                            'w-full text-left flex items-center gap-3 rounded-lg px-4 py-3 text-base transition-colors',
                            selected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted/80'
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
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-0 shrink-0">
            <Button
              className="sm:w-auto"
              disabled={!canStart}
              onClick={() => onStart(unitChoice, teamOrder)}
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
