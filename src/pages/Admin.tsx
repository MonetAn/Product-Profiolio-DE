import { useCallback, useRef } from 'react';
import { Upload, ClipboardList, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AdminHeader from '@/components/admin/AdminHeader';
import ScopeSelector from '@/components/admin/ScopeSelector';
import InitiativeTable from '@/components/admin/InitiativeTable';
import NewInitiativeDialog from '@/components/admin/NewInitiativeDialog';
import CSVImportDialog from '@/components/admin/CSVImportDialog';
import { Button } from '@/components/ui/button';
import {
  getUniqueUnits,
  getTeamsForUnits,
  filterData,
  AdminDataRow,
  AdminQuarterData,
  InitiativeType
} from '@/lib/adminDataManager';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useInitiativeMutations } from '@/hooks/useInitiativeMutations';
import { useCSVExport } from '@/hooks/useCSVExport';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useState } from 'react';

const Admin = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data from Supabase
  const { data: rawData = [], isLoading, error, refetch } = useInitiatives();
  const quarters = useQuarters(rawData);
  
  // Mutations
  const { 
    updateInitiative, 
    updateQuarterData, 
    createInitiative, 
    deleteInitiative,
    syncStatus,
    pendingChanges,
    retry 
  } = useInitiativeMutations();

  // CSV Export
  const { exportAll, exportFiltered } = useCSVExport({ quarters });

  // Filter state from URL
  const { 
    selectedUnits, 
    selectedTeams, 
    setSelectedUnits, 
    setSelectedTeams,
    setFilters,
    buildFilteredUrl 
  } = useFilterParams();

  // UI state
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Derived state
  const hasData = rawData.length > 0;
  const units = getUniqueUnits(rawData);
  const teams = getTeamsForUnits(rawData, selectedUnits);
  const filteredData = filterData(rawData, selectedUnits, selectedTeams);
  const needsSelection = hasData && selectedUnits.length === 0;
  const hideUnitTeamColumns = selectedUnits.length > 0;

  // Data modification handlers
  const handleDataChange = useCallback((id: string, field: keyof AdminDataRow, value: string | string[] | number) => {
    // Arrays (stakeholders) save immediately, text/number fields use short debounce
    const delay = Array.isArray(value) ? 0 : 300;
    updateInitiative(id, field, value, delay);
  }, [updateInitiative]);

  const handleQuarterDataChange = useCallback((
    id: string, 
    quarter: string, 
    field: keyof AdminQuarterData, 
    value: string | number | boolean
  ) => {
    updateQuarterData(id, quarter, field, value);
  }, [updateQuarterData]);

  // New initiative handler
  const handleAddInitiative = useCallback(async (data: {
    unit: string;
    team: string;
    initiative: string;
    initiativeType: InitiativeType | '';
    stakeholdersList: string[];
    description: string;
    documentationLink: string;
  }) => {
    // Build quarterly data for all quarters
    const quarterlyData: Record<string, AdminQuarterData> = {};
    quarters.forEach(q => {
      quarterlyData[q] = {
        cost: 0,
        otherCosts: 0,
        support: false,
        onTrack: true,
        metricPlan: '',
        metricFact: '',
        comment: '',
        effortCoefficient: 0
      };
    });

    try {
      await createInitiative({
        unit: data.unit,
        team: data.team,
        initiative: data.initiative,
        initiativeType: data.initiativeType,
        stakeholdersList: data.stakeholdersList,
        description: data.description,
        documentationLink: data.documentationLink,
        stakeholders: '',
        quarterlyData,
      });
      
      toast({
        title: 'Инициатива создана',
        description: `"${data.initiative}" добавлена в ${data.unit}`
      });
    } catch (err) {
      console.error('Failed to create initiative:', err);
    }
  }, [quarters, createInitiative, toast]);

  // Delete initiative handler
  const handleDeleteInitiative = useCallback(async (id: string) => {
    const initiative = rawData.find(r => r.id === id);
    try {
      await deleteInitiative(id);
      toast({
        title: 'Инициатива удалена',
        description: initiative ? `«${initiative.initiative}» удалена` : 'Инициатива удалена',
      });
    } catch (err) {
      console.error('Failed to delete initiative:', err);
    }
  }, [rawData, deleteInitiative, toast]);

  // Export handlers
  const handleDownloadAll = useCallback(() => {
    exportAll(rawData);
  }, [rawData, exportAll]);

  const handleDownloadFiltered = useCallback(() => {
    exportFiltered(filteredData);
  }, [filteredData, exportFiltered]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Загрузка инициатив...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Ошибка загрузки данных</h2>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'Не удалось загрузить инициативы'}
          </p>
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <RefreshCw size={16} />
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AdminHeader
        currentView="initiatives"
        initiativeCount={filteredData.length}
        totalInitiativeCount={rawData.length}
        hasData={hasData}
        hasFilters={selectedUnits.length > 0 || selectedTeams.length > 0}
        syncStatus={syncStatus}
        pendingChanges={pendingChanges}
        onImportClick={() => setImportDialogOpen(true)}
        onDownloadAll={handleDownloadAll}
        onDownloadFiltered={handleDownloadFiltered}
        onRetry={retry}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {!hasData ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="border-2 border-dashed rounded-xl p-12 text-center max-w-md border-border">
              <Upload size={48} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Нет инициатив</h2>
              <p className="text-muted-foreground mb-6">
                Импортируйте данные из CSV файла или создайте первую инициативу
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => setImportDialogOpen(true)}
                  variant="outline"
                >
                  Импорт CSV
                </Button>
                <Button onClick={() => setNewDialogOpen(true)}>
                  Создать инициативу
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Data view */
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScopeSelector
              units={units}
              teams={teams}
              selectedUnits={selectedUnits}
              selectedTeams={selectedTeams}
              onUnitsChange={setSelectedUnits}
              onTeamsChange={setSelectedTeams}
              onFiltersChange={setFilters}
              allData={rawData}
            />

            {needsSelection ? (
              /* Placeholder when no Unit selected */
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="border border-dashed border-border rounded-xl p-12 text-center max-w-md">
                  <ClipboardList size={48} className="mx-auto text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Выберите Unit и Team</h2>
                  <p className="text-muted-foreground">
                    Для просмотра и редактирования инициатив выберите Unit и Team в фильтрах выше
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <InitiativeTable
                  data={filteredData}
                  allData={rawData}
                  quarters={quarters}
                  selectedUnits={selectedUnits}
                  selectedTeams={selectedTeams}
                  onDataChange={handleDataChange}
                  onQuarterDataChange={handleQuarterDataChange}
                  onAddInitiative={() => setNewDialogOpen(true)}
                  onDeleteInitiative={handleDeleteInitiative}
                  modifiedIds={new Set()}
                  hideUnitTeamColumns={hideUnitTeamColumns}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Import Dialog */}
      <CSVImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      {/* New Initiative Dialog */}
      <NewInitiativeDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        units={units.length > 0 ? units : ['Default Unit']}
        teams={teams}
        defaultUnit={selectedUnits[0] || ''}
        defaultTeam={selectedTeams[0] || ''}
        onSubmit={handleAddInitiative}
      />
    </div>
  );
};

export default Admin;
