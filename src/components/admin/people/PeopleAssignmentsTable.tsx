import { useMemo } from 'react';
import { Users, ClipboardList } from 'lucide-react';
import type { Person } from '@/lib/peopleDataManager';
import { PersonAssignment, VirtualAssignment } from '@/lib/peopleDataManager';
import { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import PersonGroupRow from './PersonGroupRow';
import InitiativeGroupRow from './InitiativeGroupRow';

export type PeopleAssignmentsGroupMode = 'person' | 'initiative';

interface PeopleAssignmentsTableProps {
  people: Person[];
  initiatives: AdminDataRow[];
  assignments: PersonAssignment[];
  quarters: string[];
  groupMode: PeopleAssignmentsGroupMode;
  onGroupModeChange: (mode: PeopleAssignmentsGroupMode) => void;
  onEffortChange: (assignment: VirtualAssignment, quarter: string, value: number) => void;
  /**
   * `peopleEffort` — шире колонки кварталов, тумблер группировки не в шапке (задаётся снаружи).
   * `default` — как на странице «Люди».
   */
  variant?: 'default' | 'peopleEffort';
  /** Экран усилий по людям: список людей для «Как у…» */
  copyPeers?: Person[];
  onCopyAssignmentsFrom?: (targetPersonId: string, sourcePersonId: string) => void | Promise<void>;
  copyAssignmentsBusy?: boolean;
}

export default function PeopleAssignmentsTable({
  people,
  initiatives,
  assignments,
  quarters,
  groupMode,
  onGroupModeChange,
  onEffortChange,
  variant = 'default',
  copyPeers,
  onCopyAssignmentsFrom,
  copyAssignmentsBusy,
}: PeopleAssignmentsTableProps) {
  const isPeopleEffort = variant === 'peopleEffort';

  // Display all available quarters from initiatives (earliest to latest)
  const displayQuarters = useMemo(() => quarters, [quarters]);

  // CSS Grid: имя + кварталы + бейдж; в peopleEffort — шире колонки кварталов
  const gridCols = useMemo(() => {
    const qW = isPeopleEffort ? 92 : 70;
    const badgeW = isPeopleEffort ? 80 : 100;
    const nameMin = isPeopleEffort ? 240 : 300;
    return `minmax(${nameMin}px, 1fr) repeat(${displayQuarters.length}, ${qW}px) ${badgeW}px`;
  }, [displayQuarters.length, isPeopleEffort]);

  // Create lookup map for existing assignments
  const assignmentMap = useMemo(() => {
    const map = new Map<string, PersonAssignment>();
    assignments.forEach(a => {
      map.set(`${a.person_id}:${a.initiative_id}`, a);
    });
    return map;
  }, [assignments]);

  // Generate virtual assignments for all person-initiative combinations
  // A person can work on any initiative in their team
  const generateVirtualAssignments = (
    person: Person,
    teamInitiatives: AdminDataRow[]
  ): VirtualAssignment[] => {
    return teamInitiatives.map(initiative => {
      const key = `${person.id}:${initiative.id}`;
      const existing = assignmentMap.get(key);
      
      // Collect expected effort from initiative's quarterly data
      const expectedEffort: Record<string, number> = {};
      displayQuarters.forEach(q => {
        const qData = initiative.quarterlyData[q] as AdminQuarterData | undefined;
        if (qData?.effortCoefficient && qData.effortCoefficient > 0) {
          expectedEffort[q] = qData.effortCoefficient;
        }
      });
      
      if (existing) {
        return {
          id: existing.id,
          person_id: existing.person_id,
          initiative_id: existing.initiative_id,
          quarterly_effort: existing.quarterly_effort,
          expected_effort: expectedEffort,
          is_auto: existing.is_auto,
          isVirtual: false
        };
      }
      
      return {
        id: null,
        person_id: person.id,
        initiative_id: initiative.id,
        quarterly_effort: {},
        expected_effort: expectedEffort,
        is_auto: true,
        isVirtual: true
      };
    });
  };

  // Group by person — show all initiatives for each person's team
  const byPerson = useMemo(() => {
    return people.map(person => {
      // Get all initiatives in this person's team
      const teamInitiatives = initiatives.filter(
        i => i.unit === person.unit && i.team === person.team
      );
      
      const virtualAssignments = generateVirtualAssignments(person, teamInitiatives);
      
      return { 
        person, 
        assignments: virtualAssignments,
        initiatives: teamInitiatives
      };
    }).filter(g => g.assignments.length > 0);
  }, [people, initiatives, assignmentMap]);

  // Group by initiative — show all people in each initiative's team
  const byInitiative = useMemo(() => {
    return initiatives.map(initiative => {
      // Get all people in this initiative's team
      const teamPeople = people.filter(
        p => p.unit === initiative.unit && p.team === initiative.team
      );
      
      // Collect expected effort from initiative's quarterly data
      const expectedEffort: Record<string, number> = {};
      displayQuarters.forEach(q => {
        const qData = initiative.quarterlyData[q] as AdminQuarterData | undefined;
        if (qData?.effortCoefficient && qData.effortCoefficient > 0) {
          expectedEffort[q] = qData.effortCoefficient;
        }
      });
      
      const virtualAssignments = teamPeople.map(person => {
        const key = `${person.id}:${initiative.id}`;
        const existing = assignmentMap.get(key);
        
        if (existing) {
          return {
            id: existing.id,
            person_id: existing.person_id,
            initiative_id: existing.initiative_id,
            quarterly_effort: existing.quarterly_effort,
            expected_effort: expectedEffort,
            is_auto: existing.is_auto,
            isVirtual: false
          };
        }
        
        return {
          id: null,
          person_id: person.id,
          initiative_id: initiative.id,
          quarterly_effort: {},
          expected_effort: expectedEffort,
          is_auto: true,
          isVirtual: true
        };
      });
      
      return { 
        initiative, 
        assignments: virtualAssignments,
        people: teamPeople
      };
    }).filter(g => g.assignments.length > 0);
  }, [initiatives, people, assignmentMap, displayQuarters]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Шапка: в default — тумблер здесь; в peopleEffort — тумблер снаружи */}
      <div
        className={`sticky top-0 z-10 grid items-center border-b bg-muted/50 ${
          isPeopleEffort ? 'px-3 py-2' : 'px-4 py-3'
        }`}
        style={{ gridTemplateColumns: gridCols }}
      >
        {isPeopleEffort ? (
          <div className="min-w-0" aria-hidden />
        ) : (
          <ToggleGroup
            type="single"
            value={groupMode}
            onValueChange={(v) => v && onGroupModeChange(v as PeopleAssignmentsGroupMode)}
            className="justify-start rounded-md bg-background p-1"
          >
            <ToggleGroupItem value="person" className="gap-2 px-3">
              <Users className="h-4 w-4" />
              По людям
            </ToggleGroupItem>
            <ToggleGroupItem value="initiative" className="gap-2 px-3">
              <ClipboardList className="h-4 w-4" />
              По инициативам
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {displayQuarters.map((q) => (
          <div key={q} className="text-center text-xs font-medium tabular-nums text-muted-foreground">
            {q.replace('20', '').replace('-', ' ')}
          </div>
        ))}

        <div />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {groupMode === 'person' ? (
          // Group by person
          byPerson.length > 0 ? (
            byPerson.map(({ person, assignments: personAssignments, initiatives: personInitiatives }) => (
              <PersonGroupRow
                key={person.id}
                person={person}
                assignments={personAssignments}
                initiatives={personInitiatives}
                quarters={displayQuarters}
                gridCols={gridCols}
                onEffortChange={onEffortChange}
                copyPeers={
                  isPeopleEffort && copyPeers?.length
                    ? copyPeers.filter((p) => p.id !== person.id)
                    : undefined
                }
                onCopyFromPeer={
                  isPeopleEffort && onCopyAssignmentsFrom ? onCopyAssignmentsFrom : undefined
                }
                copyBusy={isPeopleEffort ? copyAssignmentsBusy : undefined}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">Нет людей в выбранной команде</h2>
              <p className="text-muted-foreground">
                Импортируйте сотрудников через CSV или выберите другую команду
              </p>
            </div>
          )
        ) : (
          // Group by initiative
          byInitiative.length > 0 ? (
            byInitiative.map(({ initiative, assignments: initiativeAssignments, people: initiativePeople }) => (
              <InitiativeGroupRow
                key={initiative.id}
                initiative={initiative}
                assignments={initiativeAssignments}
                people={initiativePeople}
                quarters={displayQuarters}
                gridCols={gridCols}
                onEffortChange={onEffortChange}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">Нет инициатив</h2>
              <p className="text-muted-foreground">
                Добавьте инициативы в выбранной команде
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
