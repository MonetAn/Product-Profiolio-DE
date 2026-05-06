import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { AdminDataRow } from '@/lib/adminDataManager';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ScopeSelectorProps {
  units: string[];
  teams: string[];
  selectedUnits: string[];
  selectedTeams: string[];
  onUnitsChange: (units: string[]) => void;
  onTeamsChange: (teams: string[]) => void;
  onFiltersChange?: (units: string[], teams: string[]) => void;
  allData: AdminDataRow[];
  adminViewAll?: boolean;
  selectionMode?: 'multi' | 'single';
  resolveTeamsForUnit?: (unit: string) => string[];
  lockUnit?: boolean;
  lockTeam?: boolean;
}

function teamsStillValidForUnits(
  allData: AdminDataRow[],
  unitIds: string[],
  teamIds: string[]
): string[] {
  if (unitIds.length === 0) return [];
  const allowed = new Set(
    allData.filter((r) => unitIds.includes(r.unit)).map((r) => r.team).filter(Boolean)
  );
  return teamIds.filter((t) => allowed.has(t));
}

/** Подпись, если одно имя команды есть у нескольких выбранных юнитов. */
function teamUnitSubtitle(
  allData: AdminDataRow[],
  team: string,
  selectedUnitsList: string[]
): string | null {
  if (selectedUnitsList.length <= 1) return null;
  const withTeam = [
    ...new Set(
      allData
        .filter((r) => r.team === team && selectedUnitsList.includes(r.unit))
        .map((r) => r.unit)
    ),
  ].sort((a, b) => a.localeCompare(b));
  return withTeam.length > 1 ? withTeam.join(' · ') : null;
}

function unitsContainingTeam(allData: AdminDataRow[], team: string, allowedUnits: string[]): string[] {
  const allowed = new Set(allowedUnits);
  return [
    ...new Set(
      allData.filter((r) => r.team === team && allowed.has(r.unit)).map((r) => r.unit)
    ),
  ];
}

const ScopeSelector = ({
  units,
  teams,
  selectedUnits,
  selectedTeams,
  onUnitsChange,
  onTeamsChange,
  onFiltersChange,
  allData,
  adminViewAll = false,
  selectionMode = 'multi',
  resolveTeamsForUnit,
  lockUnit = false,
  lockTeam = false,
}: ScopeSelectorProps) => {
  const [unitOpen, setUnitOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const applyFilters = useCallback(
    (nextU: string[], nextT: string[]) => {
      if (onFiltersChange) onFiltersChange(nextU, nextT);
      else {
        onUnitsChange(nextU);
        onTeamsChange(nextT);
      }
    },
    [onFiltersChange, onUnitsChange, onTeamsChange]
  );

  const getUnitLabel = () => {
    if (adminViewAll && selectedUnits.length === 0) return 'Все юниты';
    if (selectedUnits.length === 0) return 'Юнит';
    if (selectedUnits.length === 1) return selectedUnits[0];
    return `${selectedUnits.length} юнитов`;
  };

  const getTeamLabel = () => {
    if (selectionMode === 'single' && selectedTeams.length === 0) return 'Команда';
    if (selectedTeams.length === 0) return 'Все команды';
    if (selectedTeams.length === 1) return selectedTeams[0];
    return `${selectedTeams.length} команд`;
  };

  const teamsForUnitChoice = useCallback(
    (unit: string): string[] => {
      if (resolveTeamsForUnit) return resolveTeamsForUnit(unit);
      return [
        ...new Set(allData.filter((r) => r.unit === unit).map((r) => r.team).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b));
    },
    [resolveTeamsForUnit, allData]
  );

  const toggleUnit = (u: string) => {
    if (selectionMode === 'single') {
      if (selectedUnits.length === 1 && selectedUnits[0] === u) return;
      /** Другой юнит — только юнит в URL, команду выбирают заново. */
      applyFilters([u], []);
      setUnitOpen(false);
      return;
    }

    if (selectedUnits.includes(u)) {
      const newUnits = selectedUnits.filter((x) => x !== u);
      const newTeams =
        newUnits.length > 0
          ? teamsStillValidForUnits(allData, newUnits, selectedTeams)
          : [];
      applyFilters(newUnits, newTeams);
    } else {
      applyFilters([...selectedUnits, u], selectedTeams);
    }
  };

  const toggleTeam = (t: string) => {
    if (selectionMode === 'single') {
      if (selectedTeams.length === 1 && selectedTeams[0] === t) return;
      let unit: string | undefined;
      if (selectedUnits.length === 1) {
        unit = selectedUnits[0];
      } else {
        const withTeam = allData.filter((r) => r.team === t);
        unit = withTeam.find((r) => units.includes(r.unit))?.unit ?? withTeam[0]?.unit;
      }
      if (!unit) return;
      /** Одна команда в выборе; другая строка заменяет предыдущую. */
      applyFilters([unit], [t]);
      setTeamOpen(false);
      return;
    }

    if (selectedTeams.includes(t)) {
      onTeamsChange(selectedTeams.filter((x) => x !== t));
    } else {
      const newTeams = [...selectedTeams, t];
      const missingUnits = unitsContainingTeam(allData, t, units).filter(
        (unitId) => !selectedUnits.includes(unitId)
      );
      if (missingUnits.length > 0) {
        applyFilters([...new Set([...selectedUnits, ...missingUnits])], newTeams);
      } else {
        onTeamsChange(newTeams);
      }
    }
  };

  const selectAllUnits = () => {
    const nextU = [...units];
    const nextT = teamsStillValidForUnits(allData, nextU, selectedTeams);
    applyFilters(nextU, nextT);
  };

  const clearUnits = () => {
    applyFilters([], []);
  };

  const selectAllTeams = () => {
    onTeamsChange([...teams]);
  };

  const triggerCls =
    'inline-flex h-9 max-w-[min(100%,14rem)] items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const lockChipCls =
    'flex h-9 max-w-xs min-w-[10rem] items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 text-sm';

  const sectionBar = (opts: {
    multi: boolean;
    onSelectAll?: () => void;
    onClear?: () => void;
    clearTooltip?: string;
  }) => (
    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
      {opts.multi ? (
        <>
          <button type="button" className="text-xs text-primary hover:underline" onClick={opts.onSelectAll}>
            Все
          </button>
          {opts.onClear ? (
            opts.clearTooltip ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={opts.onClear}>
                      Сброс
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                    {opts.clearTooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <button type="button" className="text-xs text-primary hover:underline" onClick={opts.onClear}>
                Сброс
              </button>
            )
          ) : null}
        </>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Один вариант</span>
        </div>
      )}
    </div>
  );

  const teamRows = useMemo(() => {
    return teams.map((t) => ({
      team: t,
      subtitle: teamUnitSubtitle(allData, t, selectedUnits),
    }));
  }, [teams, allData, selectedUnits]);

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:gap-3">
      <span className="inline-flex items-center gap-1 text-muted-foreground" aria-hidden>
        <Filter className="size-4 shrink-0 opacity-70" />
      </span>

      <div className="min-w-0 shrink">
        {lockUnit ? (
          <div className={lockChipCls}>
            <span className="truncate">{selectedUnits[0] ?? '—'}</span>
            <span className="shrink-0 text-xs text-muted-foreground">доступ</span>
          </div>
        ) : (
          <Popover
            open={unitOpen}
            onOpenChange={(o) => {
              setUnitOpen(o);
              if (o) setTeamOpen(false);
            }}
          >
            <PopoverTrigger asChild>
              <button type="button" className={cn(triggerCls, 'min-w-[10.5rem] justify-between')}>
                <span className="min-w-0 flex-1 truncate text-left">{getUnitLabel()}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[90] w-[min(100vw-1rem,20rem)] p-0" collisionPadding={8}>
              {sectionBar({
                multi: selectionMode === 'multi',
                onSelectAll: selectionMode === 'multi' ? selectAllUnits : undefined,
                onClear: selectionMode === 'multi' ? clearUnits : undefined,
              })}
              <ScrollArea className="h-[min(50vh,280px)]">
                <div className="p-1">
                  {units.map((u) => (
                    <div
                      key={u}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent',
                        selectedUnits.includes(u) && 'bg-primary/10'
                      )}
                      onClick={() => toggleUnit(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleUnit(u);
                        }
                      }}
                    >
                      {selectionMode === 'multi' ? (
                        <span className="mt-0.5 inline-flex" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedUnits.includes(u)}
                            onCheckedChange={() => toggleUnit(u)}
                            aria-label={u}
                          />
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'mt-1 size-2 shrink-0 rounded-full',
                            selectedUnits.includes(u) ? 'bg-primary' : 'border border-input bg-background'
                          )}
                        />
                      )}
                      <span className="min-w-0 flex-1 leading-snug">{u}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="min-w-0 shrink">
        {lockTeam ? (
          <div className={lockChipCls}>
            <span className="truncate">{selectedTeams[0] ?? '—'}</span>
            <span className="shrink-0 text-xs text-muted-foreground">доступ</span>
          </div>
        ) : (
          <Popover
            open={teamOpen}
            onOpenChange={(o) => {
              setTeamOpen(o);
              if (o) setUnitOpen(false);
            }}
          >
            <PopoverTrigger asChild>
              <button type="button" className={cn(triggerCls, 'min-w-[10.5rem] justify-between')}>
                <span className="min-w-0 flex-1 truncate text-left">{getTeamLabel()}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[90] w-[min(100vw-1rem,22rem)] p-0" collisionPadding={8}>
              {sectionBar({
                multi: selectionMode === 'multi',
                onSelectAll: selectionMode === 'multi' && teams.length > 0 ? selectAllTeams : undefined,
                onClear: selectionMode === 'multi' ? () => onTeamsChange([]) : undefined,
                clearTooltip: 'Показать все команды выбранных юнитов',
              })}
              <ScrollArea className="h-[min(50vh,280px)]">
                <div className="p-1">
                  {teams.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Сначала выберите юнит.</p>
                  ) : (
                    teamRows.map(({ team: t, subtitle }) => (
                      <div
                        key={t}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent',
                          selectedTeams.includes(t) && 'bg-primary/10'
                        )}
                        onClick={() => toggleTeam(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleTeam(t);
                          }
                        }}
                      >
                        {selectionMode === 'multi' ? (
                          <span className="mt-0.5 inline-flex" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedTeams.includes(t)}
                              onCheckedChange={() => toggleTeam(t)}
                              aria-label={subtitle ? `${t}, ${subtitle}` : t}
                            />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'mt-1 size-2 shrink-0 rounded-full',
                              selectedTeams.includes(t) ? 'bg-primary' : 'border border-input bg-background'
                            )}
                          />
                        )}
                        <span className="min-w-0 flex-1 leading-snug">
                          <span className="block truncate">{t}</span>
                          {subtitle ? (
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                              {subtitle}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}
      </div>

    </div>
  );
};

export default ScopeSelector;
