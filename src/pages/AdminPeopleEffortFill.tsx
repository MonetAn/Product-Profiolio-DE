import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Users } from 'lucide-react';
import { LogoLoader } from '@/components/LogoLoader';
import AdminHeader from '@/components/admin/AdminHeader';
import ScopeSelector from '@/components/admin/ScopeSelector';
import PeopleAssignmentsTable, {
  type PeopleAssignmentsGroupMode,
} from '@/components/admin/people/PeopleAssignmentsTable';
import QuarterSelector from '@/components/admin/people/QuarterSelector';
import { TeamEffortSubgroupsCard } from '@/components/admin/people/TeamEffortSubgroupsCard';
import { SubgroupInitiativeMatrix } from '@/components/admin/people/SubgroupInitiativeMatrix';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePeople } from '@/hooks/usePeople';
import { usePersonAssignments, useAssignmentMutations } from '@/hooks/usePeopleAssignments';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useTeamSnapshots, getEffectiveTeamMembers } from '@/hooks/useTeamSnapshots';
import { useTeamEffortSubgroups } from '@/hooks/useTeamEffortSubgroups';
import { getUniqueUnits, getTeamsForUnits, filterData, getUnitSummary } from '@/lib/adminDataManager';
import { VirtualAssignment } from '@/lib/peopleDataManager';

type FillMode = 'byPerson' | 'bySubteam';

export default function AdminPeopleEffortFill() {
  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const { data: assignments = [] } = usePersonAssignments();
  const { data: initiatives = [] } = useInitiatives();
  const quarters = useQuarters(initiatives);

  const {
    selectedUnits,
    selectedTeams,
    setSelectedUnits,
    setSelectedTeams,
    setFilters,
    buildFilteredUrl,
  } = useFilterParams();

  const [groupMode, setGroupMode] = useState<PeopleAssignmentsGroupMode>('person');
  const [selectedQuarter, setSelectedQuarter] = useState<string | 'all'>('all');
  const [fillMode, setFillMode] = useState<FillMode>('byPerson');

  const { createAssignment, updateAssignment, copyPersonEffortFrom } = useAssignmentMutations();

  const units = useMemo(() => getUniqueUnits(initiatives), [initiatives]);
  const teams = useMemo(() => getTeamsForUnits(initiatives, selectedUnits), [initiatives, selectedUnits]);

  const { data: snapshots = [] } = useTeamSnapshots(
    selectedUnits,
    selectedTeams.length > 0 ? selectedTeams : teams
  );

  const filteredInitiatives = useMemo(() => {
    return filterData(initiatives, selectedUnits, selectedTeams);
  }, [initiatives, selectedUnits, selectedTeams]);

  const snapshotStatuses = useMemo(() => {
    if (selectedUnits.length === 0 || teams.length === 0) {
      return new Map<string, string>();
    }
    const firstUnit = selectedUnits[0];
    const firstTeam = selectedTeams.length > 0 ? selectedTeams[0] : teams[0];
    const statusMap = new Map<string, string>();
    for (const quarter of quarters) {
      const { status } = getEffectiveTeamMembers(firstUnit, firstTeam, quarter, snapshots, people, quarters);
      statusMap.set(quarter, status);
    }
    return statusMap;
  }, [selectedUnits, selectedTeams, teams, quarters, snapshots, people]);

  const filteredPeople = useMemo(() => {
    if (selectedUnits.length === 0) return [];

    const byUnitTeam = people.filter((person) => {
      if (person.unit && !selectedUnits.includes(person.unit)) return false;
      if (selectedTeams.length > 0 && person.team && !selectedTeams.includes(person.team)) return false;
      return true;
    });

    if (selectedQuarter === 'all') {
      const allMemberships = new Set<string>();
      for (const person of byUnitTeam) {
        if (!person.unit || !person.team) continue;
        for (const quarter of quarters) {
          const { people: effectiveMembers } = getEffectiveTeamMembers(
            person.unit,
            person.team,
            quarter,
            snapshots,
            people,
            quarters
          );
          if (effectiveMembers.some((p) => p.id === person.id)) {
            allMemberships.add(person.id);
            break;
          }
        }
      }
      return byUnitTeam.filter((p) => allMemberships.has(p.id));
    }

    const quarterMembers = new Set<string>();
    for (const person of byUnitTeam) {
      if (!person.unit || !person.team) continue;
      const { people: effectiveMembers } = getEffectiveTeamMembers(
        person.unit,
        person.team,
        selectedQuarter,
        snapshots,
        people,
        quarters
      );
      if (effectiveMembers.some((p) => p.id === person.id)) {
        quarterMembers.add(person.id);
      }
    }
    return byUnitTeam.filter((p) => quarterMembers.has(p.id));
  }, [people, selectedUnits, selectedTeams, selectedQuarter, quarters, snapshots]);

  const filteredAssignments = useMemo(() => {
    const initiativeIds = new Set(filteredInitiatives.map((i) => i.id));
    const personIds = new Set(filteredPeople.map((p) => p.id));
    return assignments.filter((a) => initiativeIds.has(a.initiative_id) && personIds.has(a.person_id));
  }, [assignments, filteredInitiatives, filteredPeople]);

  const displayQuarters = useMemo(() => {
    if (selectedQuarter === 'all') return quarters;
    return [selectedQuarter];
  }, [quarters, selectedQuarter]);

  const handleEffortChange = useCallback(
    async (assignment: VirtualAssignment, quarter: string, value: number) => {
      if (assignment.isVirtual || !assignment.id) {
        await createAssignment.mutateAsync({
          person_id: assignment.person_id,
          initiative_id: assignment.initiative_id,
          quarterly_effort: { [quarter]: value },
          is_auto: false,
        });
      } else {
        await updateAssignment.mutateAsync({
          id: assignment.id,
          quarterly_effort: {
            ...assignment.quarterly_effort,
            [quarter]: value,
          },
          is_auto: false,
        });
      }
    },
    [createAssignment, updateAssignment]
  );

  const handleCopyAssignmentsFrom = useCallback(
    async (targetPersonId: string, sourcePersonId: string) => {
      if (targetPersonId === sourcePersonId) return;
      await copyPersonEffortFrom.mutateAsync({
        sourcePersonId,
        targetPersonId,
        initiatives: filteredInitiatives,
        quarters: displayQuarters,
        existingAssignments: assignments,
      });
    },
    [copyPersonEffortFrom, filteredInitiatives, displayQuarters, assignments]
  );

  const needsSelection = selectedUnits.length === 0;
  const onlyUnitSelected = selectedUnits.length > 0 && selectedTeams.length === 0;
  const unitSummary = onlyUnitSelected ? getUnitSummary(initiatives, selectedUnits) : [];

  const singleTeamScope =
    selectedUnits.length === 1 && selectedTeams.length === 1 ? selectedUnits[0]! : null;
  const singleTeamName = selectedTeams.length === 1 ? selectedTeams[0]! : null;

  const canConfigureSubteams = Boolean(singleTeamScope && singleTeamName);

  useEffect(() => {
    if (!canConfigureSubteams && fillMode === 'bySubteam') {
      setFillMode('byPerson');
    }
  }, [canConfigureSubteams, fillMode]);

  const subgroupsQueryOn = canConfigureSubteams && fillMode === 'bySubteam';

  const subgroupsHook = useTeamEffortSubgroups(singleTeamScope, singleTeamName, {
    queryEnabled: subgroupsQueryOn,
  });
  const subgroupBusy =
    subgroupsHook.createSubgroup.isPending ||
    subgroupsHook.deleteSubgroup.isPending ||
    subgroupsHook.setPersonSubgroup.isPending;

  const portfolioUrl = buildFilteredUrl('/admin');

  if (peopleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  const hasScope = selectedTeams.length > 0;
  const showMatrix = !needsSelection && !onlyUnitSelected && quarters.length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AdminHeader currentView="initiatives" hasData={hasScope} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2" asChild>
              <Link to={portfolioUrl}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Портфель
              </Link>
            </Button>
            <h1 className="truncate font-juneau text-base font-medium tracking-tight sm:text-lg">
              Усилия по людям
            </h1>
          </div>
          {showMatrix ? (
            <ToggleGroup
              type="single"
              value={fillMode}
              onValueChange={(v) => v && setFillMode(v as FillMode)}
              className="shrink-0 justify-end"
            >
              <ToggleGroupItem value="byPerson" className="h-8 px-2.5 text-xs sm:text-sm">
                По людям
              </ToggleGroupItem>
              <ToggleGroupItem
                value="bySubteam"
                className="h-8 px-2.5 text-xs sm:text-sm"
                disabled={!canConfigureSubteams}
                title={
                  !canConfigureSubteams ? 'Выберите в фильтре одну команду' : undefined
                }
              >
                Подкоманды
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </div>

        <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4">
          <ScopeSelector
            units={units}
            teams={teams}
            selectedUnits={selectedUnits}
            selectedTeams={selectedTeams}
            onUnitsChange={setSelectedUnits}
            onTeamsChange={setSelectedTeams}
            onFiltersChange={setFilters}
            allData={initiatives}
          />
        </div>

        {showMatrix ? (
          <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <div className="min-w-0 flex-1">
                <QuarterSelector
                  quarters={quarters}
                  selectedQuarter={selectedQuarter}
                  onQuarterChange={setSelectedQuarter}
                  snapshotStatuses={snapshotStatuses}
                />
              </div>
              {fillMode === 'byPerson' ? (
                <ToggleGroup
                  type="single"
                  value={groupMode}
                  onValueChange={(v) => v && setGroupMode(v as PeopleAssignmentsGroupMode)}
                  className="h-8 shrink-0 justify-start lg:justify-end"
                >
                  <ToggleGroupItem value="person" className="h-8 gap-1 px-2.5 text-xs">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    Строки
                  </ToggleGroupItem>
                  <ToggleGroupItem value="initiative" className="h-8 gap-1 px-2.5 text-xs">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                    Инициативы
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {needsSelection ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Выберите unit в фильтре выше.</p>
            </div>
          ) : onlyUnitSelected ? (
            <div className="mx-auto max-h-full max-w-2xl space-y-6 overflow-y-auto p-6">
              <p className="text-sm text-muted-foreground">Выберите одну или несколько команд.</p>
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-muted-foreground">Команды по unit</h2>
                {unitSummary.map(({ unit, teams: unitTeams }) => (
                  <div key={unit} className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 font-medium">{unit}</div>
                    <ul className="space-y-2">
                      {unitTeams.map(({ team, initiativeCount: count }) => (
                        <li key={team} className="flex justify-between text-sm">
                          <span>{team || '—'}</span>
                          <span className="text-muted-foreground">{count} инициатив</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : !showMatrix ? (
            <p className="p-6 text-sm text-muted-foreground">Нет кварталов в выгрузке.</p>
          ) : (
            <>
              {fillMode === 'bySubteam' && canConfigureSubteams ? (
                <div className="max-h-[min(38vh,320px)] shrink-0 overflow-y-auto border-b border-border px-3 py-2 sm:px-4">
                  <TeamEffortSubgroupsCard
                    people={filteredPeople}
                    subgroups={subgroupsHook.subgroups}
                    membership={subgroupsHook.membership}
                    busy={subgroupBusy}
                    onCreateSubgroup={async (name) => {
                      await subgroupsHook.createSubgroup.mutateAsync(name);
                    }}
                    onDeleteSubgroup={async (id) => {
                      await subgroupsHook.deleteSubgroup.mutateAsync(id);
                    }}
                    onSetPersonSubgroup={async (personId, subgroupId) => {
                      await subgroupsHook.setPersonSubgroup.mutateAsync({ personId, subgroupId });
                    }}
                  />
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden px-1 pb-1 pt-0 sm:px-2">
                <div className="h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card">
                  {fillMode === 'bySubteam' && canConfigureSubteams ? (
                    subgroupsHook.subgroups.length > 0 ? (
                      <SubgroupInitiativeMatrix
                        subgroups={subgroupsHook.subgroups}
                        initiatives={filteredInitiatives}
                        quarters={displayQuarters}
                        queryEnabled={subgroupsQueryOn}
                      />
                    ) : (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Добавьте подкоманду.
                      </p>
                    )
                  ) : fillMode === 'bySubteam' && !canConfigureSubteams ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Выберите в фильтре одну команду.
                    </p>
                  ) : (
                    <PeopleAssignmentsTable
                      variant="peopleEffort"
                      people={filteredPeople}
                      initiatives={filteredInitiatives}
                      assignments={filteredAssignments}
                      quarters={displayQuarters}
                      groupMode={groupMode}
                      onGroupModeChange={setGroupMode}
                      onEffortChange={handleEffortChange}
                      copyPeers={filteredPeople}
                      onCopyAssignmentsFrom={handleCopyAssignmentsFrom}
                      copyAssignmentsBusy={copyPersonEffortFrom.isPending}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
