import { useState, useMemo, useCallback } from 'react';
import { Loader2, ClipboardList } from 'lucide-react';
import { usePeople } from '@/hooks/usePeople';
import { usePersonAssignments, useAssignmentMutations } from '@/hooks/usePeopleAssignments';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useFilterParams } from '@/hooks/useFilterParams';
import { 
  useTeamSnapshots, 
  getEffectiveTeamMembers
} from '@/hooks/useTeamSnapshots';
import AdminHeader from '@/components/admin/AdminHeader';
import ScopeSelector from '@/components/admin/ScopeSelector';
import PeopleAssignmentsTable from '@/components/admin/people/PeopleAssignmentsTable';
import CSVPeopleImportDialog from '@/components/admin/people/CSVPeopleImportDialog';
import QuarterSelector from '@/components/admin/people/QuarterSelector';
import { getUniqueUnits, getTeamsForUnits, filterData } from '@/lib/adminDataManager';
import { VirtualAssignment } from '@/lib/peopleDataManager';

type GroupMode = 'person' | 'initiative';

export default function AdminPeople() {
  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const { data: assignments = [] } = usePersonAssignments();
  const { data: initiatives = [] } = useInitiatives();
  const quarters = useQuarters(initiatives);
  
  // URL-synced filters
  const { 
    selectedUnits, 
    selectedTeams, 
    setSelectedUnits, 
    setSelectedTeams,
    setFilters,
    buildFilteredUrl 
  } = useFilterParams();
  
  // Dialogs & UI state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('person');
  const [selectedQuarter, setSelectedQuarter] = useState<string | 'all'>('all');
  
  // Mutations
  const { createAssignment, updateAssignment } = useAssignmentMutations();

  // Derived data - units/teams from initiatives (to match Admin page behavior)
  const units = useMemo(() => getUniqueUnits(initiatives), [initiatives]);
  const teams = useMemo(() => getTeamsForUnits(initiatives, selectedUnits), [initiatives, selectedUnits]);
  
  // Fetch team snapshots for selected units/teams
  const { data: snapshots = [] } = useTeamSnapshots(selectedUnits, selectedTeams.length > 0 ? selectedTeams : teams);
  
  // Filter initiatives by selected scope
  const filteredInitiatives = useMemo(() => {
    return filterData(initiatives, selectedUnits, selectedTeams);
  }, [initiatives, selectedUnits, selectedTeams]);

  // Get snapshot statuses for quarter indicators (use first selected unit/team)
  const snapshotStatuses = useMemo(() => {
    if (selectedUnits.length === 0 || teams.length === 0) {
      return new Map();
    }
    
    // Calculate for first team (simplified; in real scenario, combine all)
    const firstUnit = selectedUnits[0];
    const firstTeam = selectedTeams.length > 0 ? selectedTeams[0] : teams[0];
    
    const statusMap = new Map();
    for (const quarter of quarters) {
      const { status } = getEffectiveTeamMembers(firstUnit, firstTeam, quarter, snapshots, people, quarters);
      statusMap.set(quarter, status);
    }
    return statusMap;
  }, [selectedUnits, selectedTeams, teams, quarters, snapshots, people]);

  // Filter people by unit/team AND by quarterly membership (snapshot logic)
  const filteredPeople = useMemo(() => {
    if (selectedUnits.length === 0) return [];
    
    // First filter by unit/team
    const byUnitTeam = people.filter(person => {
      // Unit filter
      if (person.unit && !selectedUnits.includes(person.unit)) {
        return false;
      }
      
      // Team filter (if teams selected)
      if (selectedTeams.length > 0 && person.team && !selectedTeams.includes(person.team)) {
        return false;
      }
      
      return true;
    });
    
    // If viewing all quarters, include people who are in ANY quarter
    if (selectedQuarter === 'all') {
      // Build membership for all quarters
      const allMemberships = new Set<string>();
      
      for (const person of byUnitTeam) {
        if (!person.unit || !person.team) continue;
        
        for (const quarter of quarters) {
          const { people: effectiveMembers } = getEffectiveTeamMembers(
            person.unit, person.team, quarter, snapshots, people, quarters
          );
          if (effectiveMembers.some(p => p.id === person.id)) {
            allMemberships.add(person.id);
            break;
          }
        }
      }
      
      return byUnitTeam.filter(p => allMemberships.has(p.id));
    }
    
    // Specific quarter selected — filter to only people in that quarter's snapshot
    const quarterMembers = new Set<string>();
    
    for (const person of byUnitTeam) {
      if (!person.unit || !person.team) continue;
      
      const { people: effectiveMembers } = getEffectiveTeamMembers(
        person.unit, person.team, selectedQuarter, snapshots, people, quarters
      );
      if (effectiveMembers.some(p => p.id === person.id)) {
        quarterMembers.add(person.id);
      }
    }
    
    return byUnitTeam.filter(p => quarterMembers.has(p.id));
  }, [people, selectedUnits, selectedTeams, selectedQuarter, quarters, snapshots]);

  // Filter assignments to only show those for filtered initiatives and people
  const filteredAssignments = useMemo(() => {
    const initiativeIds = new Set(filteredInitiatives.map(i => i.id));
    const personIds = new Set(filteredPeople.map(p => p.id));
    
    return assignments.filter(a => 
      initiativeIds.has(a.initiative_id) && personIds.has(a.person_id)
    );
  }, [assignments, filteredInitiatives, filteredPeople]);

  // Quarters to display in table
  const displayQuarters = useMemo(() => {
    if (selectedQuarter === 'all') return quarters;
    return [selectedQuarter];
  }, [quarters, selectedQuarter]);

  // Handle effort change — create assignment if virtual, update if exists
  const handleEffortChange = useCallback(async (assignment: VirtualAssignment, quarter: string, value: number) => {
    if (assignment.isVirtual || !assignment.id) {
      // Create new assignment (virtual → real)
      await createAssignment.mutateAsync({
        person_id: assignment.person_id,
        initiative_id: assignment.initiative_id,
        quarterly_effort: { [quarter]: value },
        is_auto: false // Manual edit
      });
    } else {
      // Update existing assignment
      await updateAssignment.mutateAsync({
        id: assignment.id,
        quarterly_effort: {
          ...assignment.quarterly_effort,
          [quarter]: value
        },
        is_auto: false // Manual edit marks as not auto
      });
    }
  }, [createAssignment, updateAssignment]);

  // Count stats
  const peopleCount = filteredPeople.length;
  const initiativeCount = filteredInitiatives.length;

  if (peopleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const needsSelection = selectedUnits.length === 0;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AdminHeader
        currentView="people"
        peopleCount={peopleCount}
        hasData={!needsSelection}
        onImportPeople={() => setImportDialogOpen(true)}
      />

      {/* Scope Selector */}
      <div className="shrink-0">
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

      {/* Quarter Selector */}
      {!needsSelection && quarters.length > 0 && (
        <div className="px-6 py-3 border-b border-border shrink-0">
          <QuarterSelector
            quarters={quarters}
            selectedQuarter={selectedQuarter}
            onQuarterChange={setSelectedQuarter}
            snapshotStatuses={snapshotStatuses}
          />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {needsSelection ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="border border-dashed border-border rounded-xl p-12 text-center max-w-md">
              <ClipboardList size={48} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Выберите Unit</h2>
              <p className="text-muted-foreground">
                Для просмотра и редактирования привязок людей к инициативам выберите Unit в фильтрах выше
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <PeopleAssignmentsTable
              people={filteredPeople}
              initiatives={filteredInitiatives}
              assignments={filteredAssignments}
              quarters={displayQuarters}
              groupMode={groupMode}
              onGroupModeChange={setGroupMode}
              onEffortChange={handleEffortChange}
            />
          </div>
        )}
      </main>

      {/* Dialogs */}
      <CSVPeopleImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        existingUnits={units}
        existingTeams={teams}
        quarters={quarters}
      />
    </div>
  );
}
