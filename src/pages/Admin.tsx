import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Upload, ClipboardList, AlertCircle, RefreshCw } from 'lucide-react';
import { LogoLoader } from '@/components/LogoLoader';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';
import { useToast } from '@/hooks/use-toast';
import AdminHeader from '@/components/admin/AdminHeader';
import ScopeSelector from '@/components/admin/ScopeSelector';
import InitiativeTable from '@/components/admin/InitiativeTable';
import NewInitiativeDialog, { type NewInitiativeSubmitData } from '@/components/admin/NewInitiativeDialog';
import CSVImportDialog from '@/components/admin/CSVImportDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getUniqueUnits,
  getTeamsForUnits,
  filterData,
  getUnitSummary,
  createEmptyQuarterData,
  AdminDataRow,
  AdminQuarterData,
  InitiativeType
} from '@/lib/adminDataManager';
import {
  readQuickTeamQueue,
  writeQuickTeamQueue,
  clearQuickTeamQueue,
  initQuickTeamQueue,
  type QuickTeamQueueState,
} from '@/lib/adminQuickTeamQueue';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useAccess } from '@/hooks/useAccess';
import { useInitiativeMutations } from '@/hooks/useInitiativeMutations';
import { useCSVExport } from '@/hooks/useCSVExport';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPreviousQuarter, getNextQuarter } from '@/lib/quarterUtils';
import AdminQuickFlow from '@/components/admin/AdminQuickFlow';
import InitiativeDetailDialog from '@/components/admin/InitiativeDetailDialog';
import { AdminQuickFlowSetupScreen } from '@/components/admin/AdminQuickFlowSetupScreen';
import {
  ScenarioFootstepsIllustration,
  ScenarioTableIllustrationSlot,
} from '@/components/admin/AdminScenarioIllustrations';
import { GoogleSheetsSyncStrip } from '@/components/admin/GoogleSheetsSyncStrip';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

type InitiativesScreen =
  | 'start'
  | 'unitSummary'
  | 'quickStep1'
  | 'quickStep2'
  | 'quickStep3'
  | 'fullTable';

function getPreviousQuarterFromTarget(targetQuarter: string): string {
  const match = targetQuarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return getPreviousQuarter();
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  if (quarter === 1) return `${year - 1}-Q4`;
  return `${year}-Q${quarter - 1}`;
}

const Admin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { memberUnit, memberTeam, isAdmin } = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data from Supabase
  const { data: rawData = [], isLoading, error, refetch } = useInitiatives();
  const quarters = useQuarters(rawData);
  
  // Mutations
  const { 
    updateInitiative, 
    updateQuarterData, 
    updateQuarterDataBulk,
    updateQuarterDataBulkAsync,
    createInitiative, 
    deleteInitiative,
    syncAssignments,
    syncStatus,
    pendingChanges,
    retry 
  } = useInitiativeMutations();

  // CSV Export
  const { exportAll, exportFiltered } = useCSVExport({ quarters });

  // Filter state from URL
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    selectedUnits, 
    selectedTeams, 
    buildFilteredUrl 
  } = useFilterParams();
  const [quickTeamQueue, setQuickTeamQueue] = useState<QuickTeamQueueState | null>(null);

  // Derived state (must be before canShowQuick / isQuickMode)
  const hasData = rawData.length > 0;
  const adminTableAll = searchParams.get('table') === 'all';
  const units = getUniqueUnits(rawData);
  const teams = getTeamsForUnits(rawData, selectedUnits);
  const filteredData = adminTableAll
    ? rawData
    : filterData(rawData, selectedUnits, selectedTeams);
  const needsSelection = hasData && selectedUnits.length === 0 && !adminTableAll;
  const onlyUnitSelected = hasData && selectedUnits.length > 0 && selectedTeams.length === 0;
  const unitSummary = onlyUnitSelected ? getUnitSummary(rawData, selectedUnits) : [];
  const hideUnitTeamColumns = selectedUnits.length > 0;

  const isQuickMode = searchParams.get('mode') === 'quick';
  const quickQuarterFromUrl = searchParams.get('quickQuarter');
  const canShowQuick = hasData && !needsSelection && !onlyUnitSelected;
  const quickSelectedQuarter = useMemo(() => {
    const qFromQueue = quickTeamQueue?.quarter?.trim();
    if (qFromQueue) return qFromQueue;
    if (quickQuarterFromUrl?.trim()) return quickQuarterFromUrl.trim();
    return getNextQuarter();
  }, [quickTeamQueue?.quarter, quickQuarterFromUrl]);
  const quickSelectedPreviousQuarter = useMemo(
    () => getPreviousQuarterFromTarget(quickSelectedQuarter),
    [quickSelectedQuarter]
  );
  const reducedMotion = useReducedMotion();

  // UI state
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [quickAddDialogOpen, setQuickAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [createdInQuickSession, setCreatedInQuickSession] = useState<string[]>([]);
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [quickFillInitiativeId, setQuickFillInitiativeId] = useState<string | null>(null);
  const [quickDraftPatches, setQuickDraftPatches] = useState<Map<string, Record<string, Partial<AdminQuarterData>>>>(new Map());
  const [isSavingQuickDraft, setIsSavingQuickDraft] = useState(false);
  const [exitConfirmState, setExitConfirmState] = useState<{ onProceed: () => void } | null>(null);
  const [quickStep, setQuickStep] = useState<1 | 2 | 3>(1);

  // Reset quick step when entering quick mode
  useEffect(() => {
    if (isQuickMode && canShowQuick) setQuickStep(1);
  }, [isQuickMode, canShowQuick]);

  useEffect(() => {
    if (!isQuickMode) {
      setQuickTeamQueue(null);
      return;
    }
    setQuickTeamQueue((prev) => {
      if (prev) return prev;
      const s = readQuickTeamQueue();
      return s ?? null;
    });
  }, [isQuickMode]);

  // Current Initiatives screen and previous (for Back button)
  const currentInitiativesScreen = useMemo((): InitiativesScreen | null => {
    if (!hasData) return null;
    if (needsSelection) return 'start';
    if (onlyUnitSelected) return 'unitSummary';
    if (isQuickMode && canShowQuick) {
      if (quickStep === 3) return 'quickStep3';
      if (quickStep === 2) return 'quickStep2';
      return 'quickStep1';
    }
    return 'fullTable';
  }, [hasData, needsSelection, onlyUnitSelected, isQuickMode, canShowQuick, quickStep]);

  const previousInitiativesScreen = useMemo((): InitiativesScreen | null => {
    const current = currentInitiativesScreen;
    if (!current) return null;
    switch (current) {
      case 'fullTable': case 'quickStep1': case 'unitSummary': return 'start';
      case 'quickStep3': return 'quickStep2';
      case 'quickStep2': return 'quickStep1';
      case 'start': return null;
      default: return null;
    }
  }, [currentInitiativesScreen]);

  const handleInitiativesBack = useCallback(() => {
    const prev = previousInitiativesScreen;
    if (prev === null) {
      navigate('/');
      return;
    }
    if (prev === 'start') {
      clearQuickTeamQueue();
      setQuickTeamQueue(null);
      setShowQuickSetup(false);
      setSearchParams((prevParams) => {
        const p = new URLSearchParams(prevParams);
        p.delete('units');
        p.delete('teams');
        p.delete('mode');
        p.delete('table');
        return p;
      });
      return;
    }
    if (prev === 'quickStep2') {
      setQuickStep(2);
      return;
    }
    if (prev === 'quickStep1') {
      setQuickStep(1);
    }
  }, [previousInitiativesScreen, navigate, setSearchParams]);

  // Apply draft patches to rows (quick flow only)
  const applyQuickDraftPatches = useCallback((
    rows: AdminDataRow[],
    patches: Map<string, Record<string, Partial<AdminQuarterData>>>
  ): AdminDataRow[] => {
    if (patches.size === 0) return rows;
    return rows.map((row) => {
      const byQuarter = patches.get(row.id);
      if (!byQuarter) return row;
      const quarterlyData = { ...row.quarterlyData };
      for (const [q, patch] of Object.entries(byQuarter)) {
        quarterlyData[q] = { ...createEmptyQuarterData(), ...row.quarterlyData[q], ...patch };
      }
      return { ...row, quarterlyData };
    });
  }, []);

  const quickDisplayData = useMemo(
    () => applyQuickDraftPatches(filteredData, quickDraftPatches),
    [filteredData, quickDraftPatches, applyQuickDraftPatches]
  );

  /** Кварталы, где в черновике менялись коэффициенты усилий (для шага 3: лист vs база). */
  const quickDirtyEffortQuarters = useMemo(() => {
    const s = new Set<string>();
    for (const [, byQ] of quickDraftPatches) {
      for (const [q, patch] of Object.entries(byQ)) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'effortCoefficient')) {
          s.add(q);
        }
      }
    }
    return Array.from(s);
  }, [quickDraftPatches]);

  const handleQuickDraftChange = useCallback((
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean
  ) => {
    setQuickDraftPatches((prev) => {
      const next = new Map(prev);
      const byQuarter = next.get(id) ?? {};
      const quarterPatch = { ...(byQuarter[quarter] ?? {}), [field]: value };
      next.set(id, { ...byQuarter, [quarter]: quarterPatch });
      return next;
    });
  }, []);

  const handleSaveQuickDraft = useCallback(async (opts?: { silent?: boolean }) => {
    if (quickDraftPatches.size === 0) return;
    setIsSavingQuickDraft(true);
    try {
      for (const [id, byQuarter] of quickDraftPatches) {
        const row = rawData.find((r) => r.id === id);
        if (!row) continue;
        const merged = { ...row.quarterlyData };
        for (const [q, patch] of Object.entries(byQuarter)) {
          merged[q] = { ...createEmptyQuarterData(), ...row.quarterlyData[q], ...patch };
        }
        await updateQuarterDataBulkAsync(id, merged);
        for (const [q, patch] of Object.entries(byQuarter)) {
          if (patch.effortCoefficient !== undefined) {
            const updatedRow = { ...row, quarterlyData: merged };
            await syncAssignments(updatedRow, q, patch.effortCoefficient as number);
          }
        }
      }
      setQuickDraftPatches(new Map());
      if (!opts?.silent) toast({ title: 'Данные сохранены' });
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setIsSavingQuickDraft(false);
    }
  }, [quickDraftPatches, rawData, updateQuarterDataBulkAsync, syncAssignments, toast]);

  const handleSheetsPreviewCalculation = useCallback(async () => {
    const nq = getNextQuarter();
    const previewQuarterEfforts: Record<string, Record<string, number>> = {};
    for (const row of quickDisplayData) {
      const eff = row.quarterlyData[nq]?.effortCoefficient;
      if (eff === undefined || eff === null) continue;
      previewQuarterEfforts[row.id] = { [nq]: Number(eff) };
    }
    return invokeEdgeFunction('sheets-preview-calculation', {
      previewQuarterEfforts,
      maxWaitMs: 12000,
    }) as Promise<{
      preview?: { initiativeId: string; initiativeName?: string; itog: Record<string, number> }[];
      pollStable?: boolean;
      message?: string;
    }>;
  }, [quickDisplayData]);

  const handleRestoreSheetsInFromDatabase = useCallback(async () => {
    await invokeEdgeFunction('sheets-push-in', {});
    toast({
      title: 'Лист IN',
      description: 'Восстановлен из базы (без черновых оверрайдов).',
    });
  }, [toast]);

  const handleApplySheetCostsFromOut = useCallback(async () => {
    await invokeEdgeFunction('sheets-pull-out', {});
    await refetch();
    toast({
      title: 'Стоимости из OUT',
      description: 'Записаны в базу (cost и sheet_out_itog_2025).',
    });
  }, [toast, refetch]);

  const handleRequestExitQuick = useCallback((_action: 'fullTable' | 'backToStep1', onProceed: () => void) => {
    if (quickDraftPatches.size === 0) {
      onProceed();
      return;
    }
    setExitConfirmState({ onProceed });
  }, [quickDraftPatches.size]);

  const handleExitConfirmSave = useCallback(async () => {
    const onProceed = exitConfirmState?.onProceed;
    if (!onProceed) return;
    await handleSaveQuickDraft();
    setExitConfirmState(null);
    onProceed();
  }, [exitConfirmState, handleSaveQuickDraft]);

  const handleExitConfirmDiscard = useCallback(() => {
    const onProceed = exitConfirmState?.onProceed;
    setQuickDraftPatches(new Map());
    setExitConfirmState(null);
    onProceed?.();
  }, [exitConfirmState]);

  /** Таблица заполнения (админка): без юнита — все строки; юнит без команды — все команды юнита; юнит+команда — узкий фильтр. */
  const handleOpenFullFillTable = useCallback(() => {
    const u = memberUnit?.trim();
    const t = memberTeam?.trim();
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('mode');
      if (!u) {
        p.set('table', 'all');
        p.delete('units');
        p.delete('teams');
        return p;
      }
      p.delete('table');
      p.set('units', u);
      if (t) {
        p.set('teams', t);
      } else {
        const unitTeams = getTeamsForUnits(rawData, [u]);
        if (unitTeams.length > 0) {
          p.set('teams', unitTeams.join(','));
        } else {
          p.delete('teams');
        }
      }
      return p;
    });
  }, [memberUnit, memberTeam, rawData, setSearchParams]);

  const scopeOnUnitsChange = useCallback(
    (next: string[]) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('table');
        if (next.length > 0) p.set('units', next.join(','));
        else p.delete('units');
        return p;
      });
    },
    [setSearchParams]
  );
  const scopeOnTeamsChange = useCallback(
    (next: string[]) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('table');
        if (next.length > 0) p.set('teams', next.join(','));
        else p.delete('teams');
        return p;
      });
    },
    [setSearchParams]
  );
  const scopeOnFiltersChange = useCallback(
    (nextU: string[], nextT: string[]) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('table');
        if (nextU.length > 0) p.set('units', nextU.join(','));
        else p.delete('units');
        if (nextT.length > 0) p.set('teams', nextT.join(','));
        else p.delete('teams');
        return p;
      });
    },
    [setSearchParams]
  );

  // Data modification handlers
  const handleDataChange = useCallback((id: string, field: keyof AdminDataRow, value: string | string[] | number | boolean) => {
    // Arrays (stakeholders) and booleans save immediately, text/number fields use short debounce
    const delay = (Array.isArray(value) || typeof value === 'boolean') ? 0 : 300;
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

  const handleQuarterlyDataBulkChange = useCallback((
    id: string,
    quarterlyData: Record<string, AdminQuarterData>
  ) => {
    updateQuarterDataBulk(id, quarterlyData);
  }, [updateQuarterDataBulk]);

  // New initiative handler
  const handleAddInitiative = useCallback(async (data: NewInitiativeSubmitData) => {
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
        isTimelineStub: data.isTimelineStub ?? false,
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

  // Quick flow: create initiative with full payload (from NewInitiativeDialog in quick mode)
  const handleCreateInitiativeQuick = useCallback(
    async (data: NewInitiativeSubmitData) => {
      const nextQ = getNextQuarter();
      const effortPercent = data.effortPercent ?? 0;
      const quarterlyData: Record<string, AdminQuarterData> = {};
      quarters.forEach((q) => {
        quarterlyData[q] = {
          ...createEmptyQuarterData(),
          effortCoefficient: q === nextQ ? effortPercent : 0,
        };
      });
      const u = data.unit || (selectedUnits[0] ?? '');
      const t = data.team || (selectedTeams[0] ?? '');
      try {
        const result = await createInitiative({
          unit: u,
          team: t,
          initiative: data.initiative,
          initiativeType: data.initiativeType || '',
          stakeholdersList: data.stakeholdersList ?? [],
          description: data.description ?? '',
          documentationLink: data.documentationLink ?? '',
          stakeholders: '',
          isTimelineStub: data.isTimelineStub ?? false,
          quarterlyData,
        });
        const createdId = (result as { id?: string })?.id;
        if (createdId) setCreatedInQuickSession((prev) => [...prev, createdId]);
        toast({
          title: 'Инициатива добавлена',
          description: `«${data.initiative}» с ${effortPercent}% на ${nextQ}`,
        });
      } catch (err) {
        console.error('Failed to create initiative:', err);
      }
    },
    [quarters, selectedUnits, selectedTeams, createInitiative, toast]
  );

  const handleGoToFullTable = useCallback(() => {
    setCreatedInQuickSession([]);
    clearQuickTeamQueue();
    setQuickTeamQueue(null);
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('mode');
      n.delete('quickQuarter');
      return n;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSaveAndContinueOrFinish = useCallback(async () => {
    const q = quickTeamQueue ?? readQuickTeamQueue();
    setQueueActionLoading(true);
    try {
      if (quickDraftPatches.size > 0) {
        await handleSaveQuickDraft({ silent: true });
      }
      if (!q || q.teams.length === 0) {
        handleGoToFullTable();
        toast({ title: 'Готово', description: 'Можно продолжить в полной таблице.' });
        return;
      }
      const nextIdx = q.currentIndex + 1;
      if (nextIdx >= q.teams.length) {
        clearQuickTeamQueue();
        setQuickTeamQueue(null);
        setCreatedInQuickSession([]);
        setQuickStep(1);
        setQuickFillInitiativeId(null);
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          p.delete('mode');
          p.delete('units');
          p.delete('teams');
          p.delete('table');
          p.delete('quickQuarter');
          return p;
        });
        toast({ title: 'Готово', description: 'Все выбранные команды пройдены.' });
        return;
      }
      const updated = { ...q, currentIndex: nextIdx };
      writeQuickTeamQueue(updated);
      setQuickTeamQueue(updated);
      setCreatedInQuickSession([]);
      setQuickFillInitiativeId(null);
      setQuickStep(1);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('units', q.unit);
        p.set('teams', q.teams[nextIdx]);
        p.set('mode', 'quick');
        p.set('quickQuarter', q.quarter);
        p.delete('table');
        return p;
      });
      toast({ title: 'Сохранено', description: `Следующая команда: ${q.teams[nextIdx]}` });
    } finally {
      setQueueActionLoading(false);
    }
  }, [
    quickDraftPatches,
    quickTeamQueue,
    handleSaveQuickDraft,
    handleGoToFullTable,
    toast,
    setSearchParams,
  ]);

  const handleEnterQuickMode = useCallback(() => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('mode', 'quick');
      return n;
    }, { setSearchParams });
  }, [setSearchParams]);

  const handleQuickSetupStart = useCallback(
    (unit: string, teamsInOrder: string[], quarter: string) => {
      const q = initQuickTeamQueue(unit, teamsInOrder, quarter);
      writeQuickTeamQueue(q);
      setQuickTeamQueue(q);
      setShowQuickSetup(false);
      setQuickStep(1);
      setQuickDraftPatches(new Map());
      setCreatedInQuickSession([]);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('table');
        p.set('units', unit);
        p.set('teams', teamsInOrder[0]);
        p.set('mode', 'quick');
        p.set('quickQuarter', quarter);
        return p;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (!isQuickMode) return;
    const s = readQuickTeamQueue();
    if (s) setQuickTeamQueue((prev) => prev ?? s);
  }, [isQuickMode]);

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
          <LogoLoader className="h-8 w-8" />
          <p className="text-muted-foreground">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <MascotMessageScreen
        title="Упс, не удалось загрузить данные"
        description={error instanceof Error ? error.message : 'Не удалось загрузить инициативы'}
        action={
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <RefreshCw size={16} />
            Попробовать снова
          </Button>
        }
      />
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
        onExitQuick={isQuickMode ? handleGoToFullTable : undefined}
        onBack={hasData ? handleInitiativesBack : undefined}
        backLabel={previousInitiativesScreen == null ? 'dashboard' : 'back'}
      />

      {isAdmin && hasData ? <GoogleSheetsSyncStrip onAfterImport={() => refetch()} /> : null}

      <main className="flex-1 flex flex-col overflow-hidden">
        {!hasData ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="border-2 border-dashed rounded-xl p-12 text-center max-w-md border-border">
              <Upload size={48} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="font-juneau font-medium text-xl mb-2">Нет инициатив</h2>
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
            {!needsSelection && (
              <div className="shrink-0">
                <ScopeSelector
                  units={units}
                  teams={teams}
                  selectedUnits={selectedUnits}
                  selectedTeams={selectedTeams}
                  onUnitsChange={scopeOnUnitsChange}
                  onTeamsChange={scopeOnTeamsChange}
                  onFiltersChange={scopeOnFiltersChange}
                  allData={rawData}
                  adminViewAll={adminTableAll}
                />
              </div>
            )}

            {needsSelection ? (
              showQuickSetup ? (
                <AdminQuickFlowSetupScreen
                  units={units}
                  quarters={quarters}
                  rawData={rawData}
                  memberUnit={memberUnit}
                  memberTeam={memberTeam}
                  onBack={() => setShowQuickSetup(false)}
                  onStart={handleQuickSetupStart}
                />
              ) : (
              <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1 gap-px p-0 bg-border">
                <motion.div
                  className="min-h-0 w-full h-full flex rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none overflow-visible"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                >
                  <Button
                    size="lg"
                    variant="secondary"
                    className={`relative min-h-0 w-full h-full rounded-none flex flex-col py-6 sm:py-8 px-3 sm:px-5 text-center bg-card border-0 shadow-sm hover:shadow-lg hover:z-10 transition-all duration-200 motion-reduce:transition-none overflow-visible focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-inset focus-visible:shadow-lg focus-visible:z-10 items-center ${!reducedMotion ? 'admin-scenario-quick' : ''}`}
                    onClick={() => setShowQuickSetup(true)}
                  >
                    <div
                      className="w-full min-h-2 shrink-0 basis-0 grow-[0.38]"
                      aria-hidden
                    />
                    <div className="w-full flex flex-col items-center shrink-0">
                      <div className="w-full min-h-[11.75rem] sm:min-h-[13rem] flex items-center justify-center overflow-hidden px-0 mb-4 sm:mb-5">
                        <ScenarioFootstepsIllustration reducedMotion={!!reducedMotion} />
                      </div>
                      <div className="flex flex-col items-center gap-2 sm:gap-2.5 w-full">
                        <span className="font-juneau font-medium text-lg sm:text-xl leading-tight whitespace-normal text-balance max-w-sm">
                          Заполни по шагам
                        </span>
                        <span className="text-sm text-muted-foreground font-normal line-clamp-3 break-words max-w-sm">
                          Для внесения и апдейта информации по портфелю
                        </span>
                      </div>
                    </div>
                    <div className="w-full min-h-3 shrink-0 basis-0 grow" aria-hidden />
                  </Button>
                </motion.div>
                <motion.div
                  className="min-h-0 w-full h-full flex rounded-b-2xl md:rounded-r-2xl md:rounded-bl-none overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.25, delay: 0.1 }}
                >
                  <Button
                    size="lg"
                    variant="secondary"
                    className={`relative min-h-0 w-full h-full rounded-none flex flex-col py-6 sm:py-8 px-3 sm:px-5 text-center bg-card border-0 shadow-sm hover:shadow-lg hover:z-10 transition-all duration-200 motion-reduce:transition-none overflow-visible focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-inset focus-visible:shadow-lg focus-visible:z-10 items-center ${!reducedMotion ? 'admin-scenario-full' : ''}`}
                    onClick={handleOpenFullFillTable}
                  >
                    <div
                      className="w-full min-h-2 shrink-0 basis-0 grow-[0.38]"
                      aria-hidden
                    />
                    <div className="w-full flex flex-col items-center shrink-0">
                      <div className="w-full min-h-[12.75rem] sm:min-h-[14.25rem] flex items-center justify-center overflow-hidden px-0 mb-4 sm:mb-5">
                        <ScenarioTableIllustrationSlot reducedMotion={!!reducedMotion} />
                      </div>
                      <div className="flex flex-col items-center gap-2 sm:gap-2.5 w-full">
                        <span className="font-juneau font-medium text-lg sm:text-xl leading-tight whitespace-normal text-balance max-w-sm">
                          Открой всю таблицу
                        </span>
                        <span className="text-sm text-muted-foreground font-normal line-clamp-3 break-words max-w-sm">
                          Посмотреть все инициативы по всем командам и кварталам
                        </span>
                      </div>
                    </div>
                    <div className="w-full min-h-3 shrink-0 basis-0 grow" aria-hidden />
                  </Button>
                </motion.div>
              </div>
              )
            ) : onlyUnitSelected ? (
              /* Only Unit selected: hint + unit summary (no table to avoid 100% sum across teams) */
              <div className="flex-1 flex flex-col overflow-auto p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="border border-dashed border-border rounded-xl p-8 text-center">
                    <ClipboardList size={40} className="mx-auto text-muted-foreground mb-3" />
                    <h2 className="font-juneau font-medium text-lg mb-2">Выберите одну или несколько команд</h2>
                    <p className="text-muted-foreground text-sm">
                      Чтобы редактировать инициативы и проценты по кварталам, выберите команды в фильтрах выше
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Сводка по юнитам</h3>
                    {unitSummary.map(({ unit, teams: unitTeams }) => (
                      <div key={unit} className="rounded-lg border border-border bg-card p-4">
                        <div className="font-medium mb-3">{unit}</div>
                        <ul className="space-y-2">
                          {unitTeams.map(({ team, initiativeCount }) => (
                            <li key={team} className="flex justify-between text-sm items-center">
                              <button
                                type="button"
                                onClick={() => scopeOnTeamsChange([team])}
                                className="text-primary hover:underline text-left"
                              >
                                {team || '—'}
                              </button>
                              <span className="text-muted-foreground">{initiativeCount} инициатив</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : isQuickMode && canShowQuick ? (
              <AdminQuickFlow
                filteredData={quickDisplayData}
                quarters={quarters}
                previousQuarter={quickSelectedPreviousQuarter}
                nextQuarter={quickSelectedQuarter}
                unit={selectedUnits[0] ?? ''}
                team={selectedTeams[0] ?? ''}
                createdInQuickSession={createdInQuickSession}
                step={quickStep}
                setStep={setQuickStep}
                onQuarterDataChange={handleQuickDraftChange}
                onOpenAddInitiative={() => setQuickAddDialogOpen(true)}
                onGoToFullTable={handleGoToFullTable}
                onOpenFillInitiative={setQuickFillInitiativeId}
                hasQuickDraft={quickDraftPatches.size > 0}
                dirtyEffortQuarters={quickDirtyEffortQuarters}
                onSaveQuickDraft={handleSaveQuickDraft}
                isSavingQuickDraft={isSavingQuickDraft}
                onRequestExitQuick={handleRequestExitQuick}
                queueProgress={
                  quickTeamQueue && quickTeamQueue.teams.length > 0
                    ? {
                        current: quickTeamQueue.currentIndex + 1,
                        total: quickTeamQueue.teams.length,
                        teamName: quickTeamQueue.teams[quickTeamQueue.currentIndex] ?? '',
                      }
                    : undefined
                }
                onSaveAndContinueQueue={handleSaveAndContinueOrFinish}
                queueActionLoading={queueActionLoading}
                runSheetsPreviewCalculation={handleSheetsPreviewCalculation}
                restoreSheetsInFromDatabase={handleRestoreSheetsInFromDatabase}
                applySheetCostsFromOut={handleApplySheetCostsFromOut}
                enableSheetsPreviewStep={!!isAdmin}
              />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {canShowQuick && (
                  <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
                    <span className="text-sm text-muted-foreground">
                      Заполнить информацию на следующие кварталы
                      {selectedUnits.length === 1 && selectedTeams.length === 1 && (
                        <span className="ml-2 text-xs text-muted-foreground/90">
                          — Рекомендуется для быстрого ввода по одной команде
                        </span>
                      )}
                    </span>
                    <Button size="sm" variant="secondary" onClick={handleEnterQuickMode}>
                      Заполнить информацию на следующие кварталы
                    </Button>
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  <InitiativeTable
                    data={filteredData}
                    allData={rawData}
                    quarters={quarters}
                    selectedUnits={selectedUnits}
                    selectedTeams={selectedTeams}
                    onDataChange={handleDataChange}
                    onQuarterDataChange={handleQuarterDataChange}
                    onQuarterlyDataBulkChange={handleQuarterlyDataBulkChange}
                    onAddInitiative={() => setNewDialogOpen(true)}
                    onDeleteInitiative={handleDeleteInitiative}
                    modifiedIds={new Set()}
                    hideUnitTeamColumns={hideUnitTeamColumns}
                  />
                </div>
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

      {/* New Initiative Dialog (full table) */}
      <NewInitiativeDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        units={units.length > 0 ? units : ['Default Unit']}
        teams={teams}
        defaultUnit={selectedUnits[0] || ''}
        defaultTeam={selectedTeams[0] || ''}
        onSubmit={handleAddInitiative}
      />

      {/* New Initiative Dialog (quick flow: full form + % for next quarter) */}
      {isQuickMode && (
        <NewInitiativeDialog
          open={quickAddDialogOpen}
          onOpenChange={setQuickAddDialogOpen}
          units={units}
          teams={teams}
          defaultUnit={selectedUnits[0] || ''}
          defaultTeam={selectedTeams[0] || ''}
          mode="quick"
          nextQuarter={getNextQuarter()}
          onSubmit={handleCreateInitiativeQuick}
        />
      )}

      {/* Quick flow: exit confirm when draft has changes */}
      <AlertDialog open={!!exitConfirmState} onOpenChange={(open) => !open && setExitConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
            <AlertDialogDescription>
              Есть несохранённые изменения. Сохранить их перед выходом?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button variant="outline" onClick={handleExitConfirmDiscard}>
              Не сохранять
            </Button>
            <Button onClick={handleExitConfirmSave} disabled={isSavingQuickDraft}>
              {isSavingQuickDraft ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick flow: fill-in dialog for validation step */}
      {isQuickMode && quickFillInitiativeId && (
        <InitiativeDetailDialog
          initiative={rawData.find((r) => r.id === quickFillInitiativeId) ?? null}
          allData={rawData}
          quarters={quarters}
          open={!!quickFillInitiativeId}
          onOpenChange={(open) => !open && setQuickFillInitiativeId(null)}
          onDataChange={handleDataChange}
          onQuarterDataChange={handleQuarterDataChange}
        />
      )}

    </div>
  );
};

export default Admin;
