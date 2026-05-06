import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Upload,
  ClipboardList,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { LogoLoader } from '@/components/LogoLoader';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';
import { useToast } from '@/hooks/use-toast';
import AdminHeader from '@/components/admin/AdminHeader';
import ScopeSelector from '@/components/admin/ScopeSelector';
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
import { fillDefaultUnitTeam } from '@/lib/adminFillScope';
import {
  getUniqueUnits,
  getTeamsForUnits,
  createEmptyQuarterData,
  AdminDataRow,
  AdminQuarterData,
  type GeoCostSplit,
  stakeholdersListFromGeoSplit,
} from '@/lib/adminDataManager';
import {
  readQuickTeamQueue,
  writeQuickTeamQueue,
  clearQuickTeamQueue,
  initQuickTeamQueue,
  type QuickTeamQueueState,
} from '@/lib/adminQuickTeamQueue';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useMarketCountries, buildCountryIdToClusterMap } from '@/hooks/useMarketCountries';
import { useAccess } from '@/hooks/useAccess';
import { useAuth } from '@/hooks/useAuth';
import { useInitiativeMutations } from '@/hooks/useInitiativeMutations';
import { useCSVExport } from '@/hooks/useCSVExport';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { compareQuarters, getCurrentQuarter } from '@/lib/quarterUtils';
import { buildQuarterlyDataFromPreview } from '@/lib/adminQuickFlowRedistributeCosts';
import AdminQuickFlow from '@/components/admin/AdminQuickFlow';
import InitiativeDetailDialog from '@/components/admin/InitiativeDetailDialog';
import { AdminQuickFlowSetupScreen } from '@/components/admin/AdminQuickFlowSetupScreen';
import { AdminQuickFlowRosterStep } from '@/components/admin/AdminQuickFlowRosterStep';
import { AdminQuickFlowStepTrack } from '@/components/admin/AdminQuickFlowStepTrack';
import { AdminQuickFlowPortfolioFilledCelebration } from '@/components/admin/AdminQuickFlowPortfolioFilledCelebration';
import { GoogleSheetsSyncStrip } from '@/components/admin/GoogleSheetsSyncStrip';
import { AdminPortfolioFillHub } from '@/components/admin/AdminPortfolioFillHub';
import {
  AdminPortfolioHubPanels,
  type PortfolioHubBlock,
  type PortfolioHubPanel,
  nextHubBlock,
  nextNavCaption,
} from '@/components/admin/AdminPortfolioHubPanels';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import {
  fetchHubBlockAcksForQuarter,
  upsertHubBlockAckForQuarter,
  getHubBlockAckAt,
  formatHubAckTimestampRu,
  setPortfolioHubCelebrationShown,
  wasPortfolioHubCelebrationShown,
  type PortfolioHubAckBlock,
  type PortfolioHubAckByBlock,
} from '@/lib/portfolioHubAck';
import { isPortfolioHubFullyDoneForQuarter, portfolioHubBlockIncomplete } from '@/lib/portfolioHubCompletion';
import { cn } from '@/lib/utils';
import {
  clearPortfolioHubDraft,
  draftStateFromSnapshot,
  isHubLocalRowId,
  loadPortfolioHubDraft,
  mergePortfolioHubDisplay,
  portfolioHubDraftStorageKey,
  savePortfolioHubDraft,
  snapshotFromDraftState,
  type HubRowFieldPatch,
  HUB_LOCAL_ROW_PREFIX,
} from '@/lib/portfolioHubDraft';
import { quarterlyDataToJson } from '@/hooks/useInitiatives';

/** Полоса Google Sheets под хедером: выключена, логика в компоненте и хендлерах сохранена. */
const SHOW_GOOGLE_SHEETS_SYNC_STRIP_UI = false;

type InitiativesScreen =
  | 'start'
  | 'quickSetupContext'
  | 'quickRosterPreflight'
  | 'unitSummary'
  | 'quickStep1'
  | 'quickStep2'
  | 'quickStep3'
  | 'quickStep4'
  | 'quickStep5'
  | 'quickStep6'
  | 'quickStep7'
  | 'quickStep8'
  | 'fullTable';

const Admin = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { memberUnit, memberTeam, memberAffiliations, isAdmin, isSuperAdmin, scope, accessLoading } = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter state from URL
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedUnits,
    selectedTeams,
    setFilters,
  } = useFilterParams();
  const adminTableAll = searchParams.get('table') === 'all';

  // Release toggle: keep route/feature, but hide entry points in current iteration.
  const peopleEffortFillTo: string | undefined = undefined;

  // Data from Supabase (без default на data — иначе нельзя отличить «ещё не загружали» от «пустой список»)
  const { data: initiativesData, isPending, error, refetch } = useInitiatives({
    units: selectedUnits,
    teams: selectedTeams,
    tableAll: adminTableAll,
  });
  /**
   * Каталог юнитов/команд для пикера: показываем полный каталог любому админу.
   * Sensitive юниты/команды по-прежнему фильтрует RLS (видны только super_admin).
   */
  const catalogTableAll = true;
  const { data: catalogInitiativesData } = useInitiatives({
    units: [],
    teams: [],
    tableAll: catalogTableAll,
  });
  const rawData = initiativesData ?? [];
  const scopeCatalogData = useMemo(
    () => catalogInitiativesData ?? [],
    [catalogInitiativesData]
  );
  const quarters = useQuarters(rawData);
  const { data: marketCountries = [] } = useMarketCountries({ includeInactive: false });
  const countryIdToClusterKey = useMemo(
    () => buildCountryIdToClusterMap(marketCountries),
    [marketCountries]
  );
  
  // Mutations
  const { 
    updateInitiative, 
    updateQuarterData, 
    updateQuarterDataBulk,
    updateQuarterDataBulkAsync,
    updateInitiativeFieldAsync,
    updateInitiativeGeoCostSplit,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
    createInitiative, 
    deleteInitiative,
    syncAssignments,
    syncStatus,
    pendingChanges,
    retry,
    flushDebouncedSavesNow,
    isSaving: mutationsSaving,
    immediateUpdate,
  } = useInitiativeMutations();

  // CSV Export
  const { exportAll, exportFiltered, exportGeoSplitAll, exportGeoSplitFiltered } = useCSVExport({
    quarters,
    marketCountries,
  });

  const [quickTeamQueue, setQuickTeamQueue] = useState<QuickTeamQueueState | null>(null);

  // Derived state (must be before canShowQuick / isQuickMode)
  const hasData = rawData.length > 0;
  const units = getUniqueUnits(scopeCatalogData);
  const teams = getTeamsForUnits(scopeCatalogData, selectedUnits);
  const filteredData = rawData;

  const fillAccessCtx = useMemo(
    () => ({
      isSuperAdmin,
      scope,
      memberUnit,
      memberTeam,
      memberAffiliations: memberAffiliations ?? [],
    }),
    [isSuperAdmin, scope, memberUnit, memberTeam, memberAffiliations]
  );

  /**
   * В этой итерации админка не сужает скоп: любой админ может выбрать любой unit/team.
   * Sensitive ряды по-прежнему фильтрует RLS — обычный admin их не получает в каталоге.
   */
  const fillUnitOptions = useMemo(
    () => getUniqueUnits(scopeCatalogData),
    [scopeCatalogData]
  );

  const fillResolveTeamsForUnit = useCallback(
    (unit: string) => getTeamsForUnits(scopeCatalogData, [unit]),
    [scopeCatalogData]
  );

  const fillScopeTeamOptions = useMemo(() => {
    if (selectedUnits.length === 0) return getTeamsForUnits(scopeCatalogData, []);
    const set = new Set<string>();
    for (const u of selectedUnits) {
      for (const t of fillResolveTeamsForUnit(u)) set.add(t);
    }
    return Array.from(set).sort();
  }, [selectedUnits, fillResolveTeamsForUnit, scopeCatalogData]);

  const fillLocks = { lockUnit: false, lockTeam: false } as const;
  const needsSelection = hasData && selectedUnits.length === 0 && !adminTableAll;
  const onlyUnitSelected = hasData && selectedUnits.length > 0 && selectedTeams.length === 0;

  const isQuickMode = searchParams.get('mode') === 'quick';
  const canShowQuick = hasData && !needsSelection && !onlyUnitSelected;

  /**
   * В этой итерации не подставляем unit/team автоматически и не подрезаем URL по scope.
   * Пустой выбор — это валидное состояние: пикер показывает заглушки «Юнит» / «Команда»,
   * пользователь выбирает сам.
   */

  const currentQueueTeam =
    quickTeamQueue && quickTeamQueue.teams.length > 0
      ? quickTeamQueue.teams[quickTeamQueue.currentIndex] ?? ''
      : '';

  /** Все кварталы из выгрузки — сценарий Quick Flow больше не ограничивает подмножество. */
  const quickFillQuarters = useMemo(
    () => [...quarters].filter(Boolean).sort(compareQuarters),
    [quarters]
  );

  /** Шаг коэффициентов в AdminQuickFlow: 1 если состав уже пройден в очереди, иначе 2 (после встроенного состава). */
  const suppressRosterInQuickFlow = Boolean(quickTeamQueue?.teams.length);
  const coeffQuickStepIndex = suppressRosterInQuickFlow ? 1 : 2;

  const needsRosterPreflight =
    isQuickMode &&
    canShowQuick &&
    !!quickTeamQueue &&
    quickTeamQueue.teams.length > 0 &&
    !quickTeamQueue.rosterPreflightDoneByTeam?.[currentQueueTeam];

  /** С очередью состав перед сценарием; шаг выбора кварталов убран. */
  const quickFlowMaxInnerWhenQueued = isAdmin ? 7 : 6;
  const quickFlowMaxInner = quickTeamQueue?.teams.length
    ? quickFlowMaxInnerWhenQueued
    : isAdmin
      ? 8
      : 7;

  const reducedMotion = useReducedMotion();

  // UI state
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [createdInQuickSession, setCreatedInQuickSession] = useState<string[]>([]);
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [quickSetupTeamCount, setQuickSetupTeamCount] = useState(0);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [quickFillInitiativeId, setQuickFillInitiativeId] = useState<string | null>(null);
  /** После «+» на шаге коэффициентов — сфокусировать поле названия новой строки. */
  const [matrixFocusInitiativeId, setMatrixFocusInitiativeId] = useState<string | null>(null);
  const clearMatrixFocusInitiative = useCallback(() => setMatrixFocusInitiativeId(null), []);
  const [quickDraftPatches, setQuickDraftPatches] = useState<Map<string, Record<string, Partial<AdminQuarterData>>>>(new Map());

  useEffect(() => {
    if (!isQuickMode) setMatrixFocusInitiativeId(null);
  }, [isQuickMode]);
  type QuickFlowRowPatch = Partial<
    Pick<
      AdminDataRow,
      | 'initiative'
      | 'stakeholdersList'
      | 'description'
      | 'documentationLink'
      | 'isTimelineStub'
      | 'initiativeGeoCostSplit'
    >
  >;
  const [quickRowPatches, setQuickRowPatches] = useState<Map<string, QuickFlowRowPatch>>(new Map());
  const [isSavingQuickDraft, setIsSavingQuickDraft] = useState(false);
  const [exitConfirmState, setExitConfirmState] = useState<{ onProceed: () => void } | null>(null);
  const [quickStep, setQuickStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const prevIsQuickModeRef = useRef(false);
  /** Модальные блоки заполнения с полной таблицы (не режим mode=quick). */
  const [hubPanelOpen, setHubPanelOpen] = useState<PortfolioHubPanel>(null);
  const [hubAckByBlock, setHubAckByBlock] = useState<PortfolioHubAckByBlock>({});
  const [hubAckRefresh, setHubAckRefresh] = useState(0);
  const [hubCompletionCelebrationOpen, setHubCompletionCelebrationOpen] = useState(false);
  /** Оверлей после успешного «Сохранить и завершить» в конце quick flow; «Продолжить» выполняет выход из режима. */
  const [quickCompletionCelebrationOpen, setQuickCompletionCelebrationOpen] = useState(false);
  const quickExitAfterCelebrationRef = useRef<(() => void) | null>(null);

  /** Черновик блоков портфеля (данные в БД только по «Сохранить»). */
  const [hubRowPatches, setHubRowPatches] = useState<Map<string, HubRowFieldPatch>>(new Map());
  const [hubQuarterPatches, setHubQuarterPatches] = useState<
    Map<string, Record<string, Partial<AdminQuarterData>>>
  >(new Map());
  const [hubPendingRows, setHubPendingRows] = useState<AdminDataRow[]>([]);
  const [hubDeletedIds, setHubDeletedIds] = useState<Set<string>>(new Set());
  /** Полный цикл «Сохранить» в хабе: запись в БД + refetch + отметка прогресса на обзоре. */
  const [hubPanelSaveBusy, setHubPanelSaveBusy] = useState(false);
  /** Открыт диалог «есть несохранённое»; target — куда перейти после решения (null = закрыть хаб). */
  const [hubNavPending, setHubNavPending] = useState<{ target: PortfolioHubPanel | null } | null>(null);
  /** После полного закрытия оверлея хаба — при следующем открытии подтянуть черновик из localStorage. */
  const hubSessionClosedRef = useRef(true);

  const hubDisplayData = useMemo(
    () =>
      mergePortfolioHubDisplay(filteredData, {
        rowPatches: hubRowPatches,
        quarterPatches: hubQuarterPatches,
        pendingRows: hubPendingRows,
        deletedIds: hubDeletedIds,
      }),
    [filteredData, hubRowPatches, hubQuarterPatches, hubPendingRows, hubDeletedIds]
  );

  const hubDraftDirty = useMemo(
    () =>
      hubRowPatches.size > 0 ||
      hubQuarterPatches.size > 0 ||
      hubPendingRows.length > 0 ||
      hubDeletedIds.size > 0,
    [hubRowPatches, hubQuarterPatches, hubPendingRows, hubDeletedIds]
  );

  const hubActiveAckBlock = useMemo((): PortfolioHubAckBlock | null => {
    if (!hubPanelOpen || hubPanelOpen === 'roster') return null;
    return hubPanelOpen as PortfolioHubAckBlock;
  }, [hubPanelOpen]);

  const hubPanelBlockIncomplete = useMemo(() => {
    if (!hubActiveAckBlock) return false;
    return portfolioHubBlockIncomplete(hubActiveAckBlock, hubDisplayData, quarters);
  }, [hubActiveAckBlock, hubDisplayData, quarters]);

  const currentQuarter = getCurrentQuarter();

  useEffect(() => {
    const unit = selectedUnits[0] ?? '';
    const team = selectedTeams[0] ?? '';
    if (!unit || !team) {
      setHubAckByBlock({});
      return;
    }
    let cancelled = false;
    fetchHubBlockAcksForQuarter(unit, team, currentQuarter)
      .then((ack) => {
        if (!cancelled) setHubAckByBlock(ack);
      })
      .catch(() => {
        if (!cancelled) setHubAckByBlock({});
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUnits, selectedTeams, currentQuarter, hubAckRefresh]);

  const hubPanelAckAtIso = useMemo(() => {
    if (!hubActiveAckBlock) return null;
    return getHubBlockAckAt(hubAckByBlock, hubActiveAckBlock);
  }, [hubActiveAckBlock, hubAckByBlock]);

  const hubSaveStatusTitle = useMemo(() => {
    if (hubPanelSaveBusy) return 'Сохранение…';
    if (hubDraftDirty) return 'Есть несохранённые изменения';
    if (!hubActiveAckBlock) return 'Без черновика';
    if (hubPanelBlockIncomplete) return 'Блок заполнен не полностью';
    if (hubPanelAckAtIso) {
      const t = formatHubAckTimestampRu(hubPanelAckAtIso);
      return t ? `Данные актуальны · ${t}` : 'Данные актуальны';
    }
    return 'Сохраните — в базе и отметка просмотра';
  }, [
    hubPanelSaveBusy,
    hubDraftDirty,
    hubActiveAckBlock,
    hubPanelBlockIncomplete,
    hubPanelAckAtIso,
  ]);

  const hubSaveStatusIcon = useMemo(() => {
    if (hubPanelSaveBusy) {
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />;
    }
    if (hubDraftDirty) {
      return <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
    }
    if (!hubActiveAckBlock) {
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    }
    if (hubPanelBlockIncomplete) {
      return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />;
    }
    if (hubPanelAckAtIso) {
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
    }
    return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />;
  }, [hubPanelSaveBusy, hubDraftDirty, hubActiveAckBlock, hubPanelBlockIncomplete, hubPanelAckAtIso]);

  const hubSaveStatusBoxClass = useMemo(
    () =>
      cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background',
        hubPanelBlockIncomplete && !hubDraftDirty && hubActiveAckBlock
          ? 'border-destructive/50'
          : 'border-border'
      ),
    [hubPanelBlockIncomplete, hubDraftDirty, hubActiveAckBlock]
  );

  const hubDraftStorageKeyResolved = useMemo(() => {
    const uid = user?.id;
    if (!uid) return null;
    return portfolioHubDraftStorageKey(uid, selectedUnits[0] ?? '', selectedTeams[0] ?? '');
  }, [user?.id, selectedUnits, selectedTeams]);

  const requestHubPanelChange = useCallback(
    (next: PortfolioHubPanel | null) => {
      if (hubDraftDirty && next !== hubPanelOpen) {
        setHubNavPending({ target: next });
        return;
      }
      setHubPanelOpen(next);
    },
    [hubDraftDirty, hubPanelOpen]
  );

  const handleHubGoNextBlock = useCallback(() => {
    const open = hubPanelOpen;
    if (!open) return;
    if (open === 'roster') {
      requestHubPanelChange('coefficients');
      return;
    }
    const n = nextHubBlock(open as PortfolioHubBlock);
    if (n) requestHubPanelChange(n);
    else requestHubPanelChange(null);
  }, [hubPanelOpen, requestHubPanelChange]);

  // Сбрасываем шаг только при **входе** в quick mode, а не при каждом canShowQuick === true.
  // Иначе кратковременный canShowQuick === false (рефетч без данных, мигание onlyUnitSelected и т.п.)
  // снова даёт true → эффект дёргал setQuickStep(1) и экран на миг показывал шаг 1 (выбор таблица / по шагам).
  useEffect(() => {
    const wasQuick = prevIsQuickModeRef.current;
    prevIsQuickModeRef.current = isQuickMode;
    if (isQuickMode && !wasQuick && canShowQuick) {
      setQuickStep(1);
    }
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

  useEffect(() => {
    if (!showQuickSetup) setQuickSetupTeamCount(0);
  }, [showQuickSetup]);

  const quickFlowLinearProgress = useMemo(() => {
    if (!hasData) return null;
    if (needsSelection && showQuickSetup) {
      const total =
        quickSetupTeamCount > 0
          ? 1 + quickSetupTeamCount * (1 + quickFlowMaxInnerWhenQueued)
          : undefined;
      return { current: 1, total };
    }
    if (!isQuickMode || !canShowQuick) return null;
    if (!quickTeamQueue) {
      return { current: quickStep, total: quickFlowMaxInner };
    }
    const n = quickTeamQueue.teams.length;
    if (n === 0) {
      return { current: quickStep, total: quickFlowMaxInner };
    }
    const perTeam = 1 + quickFlowMaxInner;
    const total = 1 + n * perTeam;
    const idx = quickTeamQueue.currentIndex;
    if (needsRosterPreflight) {
      return { current: 2 + idx * perTeam, total };
    }
    return {
      current: 2 + idx * perTeam + quickStep,
      total,
    };
  }, [
    hasData,
    needsSelection,
    showQuickSetup,
    quickSetupTeamCount,
    isQuickMode,
    canShowQuick,
    quickTeamQueue,
    needsRosterPreflight,
    quickStep,
    quickFlowMaxInner,
    quickFlowMaxInnerWhenQueued,
  ]);

  // Current Initiatives screen and previous (for Back button)
  const currentInitiativesScreen = useMemo((): InitiativesScreen | null => {
    if (!hasData) return null;
    if (needsSelection) {
      if (showQuickSetup) return 'quickSetupContext';
      return 'start';
    }
    if (onlyUnitSelected) return 'unitSummary';
    if (isQuickMode && canShowQuick) {
      if (needsRosterPreflight) return 'quickRosterPreflight';
      if (quickStep === 8) return 'quickStep8';
      if (quickStep === 7) return 'quickStep7';
      if (quickStep === 6) return 'quickStep6';
      if (quickStep === 5) return 'quickStep5';
      if (quickStep === 4) return 'quickStep4';
      if (quickStep === 3) return 'quickStep3';
      if (quickStep === 2) return 'quickStep2';
      return 'quickStep1';
    }
    return 'fullTable';
  }, [
    hasData,
    needsSelection,
    showQuickSetup,
    onlyUnitSelected,
    isQuickMode,
    canShowQuick,
    needsRosterPreflight,
    quickStep,
  ]);

  const previousInitiativesScreen = useMemo((): InitiativesScreen | null => {
    const current = currentInitiativesScreen;
    if (!current) return null;
    switch (current) {
      case 'fullTable':
        return null;
      case 'unitSummary':
        return 'start';
      case 'quickSetupContext':
        return 'start';
      case 'quickRosterPreflight':
        return 'quickSetupContext';
      case 'quickStep1':
        return quickTeamQueue ? 'quickRosterPreflight' : 'start';
      case 'quickStep8':
        return 'quickStep7';
      case 'quickStep7':
        return 'quickStep6';
      case 'quickStep6':
        return 'quickStep5';
      case 'quickStep5':
        return 'quickStep4';
      case 'quickStep4':
        return 'quickStep3';
      case 'quickStep3':
        return 'quickStep2';
      case 'quickStep2':
        return 'quickStep1';
      case 'start':
        return null;
      default:
        return null;
    }
  }, [currentInitiativesScreen, quickTeamQueue]);

  const handleBackFromQuickPickQuarters = useCallback(() => {
    clearQuickTeamQueue();
    setQuickTeamQueue(null);
    setShowQuickSetup(true);
    setSearchParams((prevParams) => {
      const p = new URLSearchParams(prevParams);
      p.delete('mode');
      p.delete('quickQs');
      p.delete('units');
      p.delete('teams');
      p.delete('table');
      p.delete('quickQuarterFrom');
      p.delete('quickQuarterTo');
      p.delete('quickQuarter');
      return p;
    });
  }, [setSearchParams]);

  const handleInitiativesBack = useCallback(() => {
    if (hubPanelOpen !== null) {
      requestHubPanelChange(null);
      return;
    }

    const cur = currentInitiativesScreen;

    if (cur === 'quickSetupContext') {
      setShowQuickSetup(false);
      return;
    }
    if (cur === 'quickRosterPreflight') {
      handleBackFromQuickPickQuarters();
      return;
    }
    if (cur === 'quickStep1' && quickTeamQueue) {
      const team = quickTeamQueue.teams[quickTeamQueue.currentIndex];
      setQuickDraftPatches(new Map());
      setQuickRowPatches(new Map());
      setQuickTeamQueue((q) => {
        if (!q || !team) return q;
        const next: QuickTeamQueueState = {
          ...q,
          rosterPreflightDoneByTeam: { ...q.rosterPreflightDoneByTeam, [team]: false },
        };
        writeQuickTeamQueue(next);
        return next;
      });
      setSearchParams((prevParams) => {
        const p = new URLSearchParams(prevParams);
        p.delete('quickQs');
        return p;
      });
      return;
    }

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
        p.delete('quickQuarterFrom');
        p.delete('quickQuarterTo');
        p.delete('quickQuarter');
        p.delete('quickQs');
        return p;
      });
      return;
    }
    if (prev === 'quickStep7') {
      setQuickStep(7);
      return;
    }
    if (prev === 'quickStep6') {
      setQuickStep(6);
      return;
    }
    if (prev === 'quickStep5') {
      setQuickStep(5);
      return;
    }
    if (prev === 'quickStep4') {
      setQuickStep(4);
      return;
    }
    if (prev === 'quickStep3') {
      setQuickStep(3);
      return;
    }
    if (prev === 'quickStep2') {
      setQuickStep(2);
      return;
    }
    if (prev === 'quickStep1') {
      setQuickStep(1);
    }
  }, [
    hubPanelOpen,
    requestHubPanelChange,
    currentInitiativesScreen,
    previousInitiativesScreen,
    quickTeamQueue,
    handleBackFromQuickPickQuarters,
    navigate,
    setSearchParams,
  ]);

  const resetHubDraft = useCallback(() => {
    setHubRowPatches(new Map());
    setHubQuarterPatches(new Map());
    setHubPendingRows([]);
    setHubDeletedIds(new Set());
  }, []);

  const handleHubRowDraftChange = useCallback(
    (id: string, field: keyof AdminDataRow, value: string | string[] | number | boolean) => {
      const allowed: (keyof HubRowFieldPatch)[] = [
        'initiative',
        'stakeholdersList',
        'description',
        'documentationLink',
        'isTimelineStub',
      ];
      if (!allowed.includes(field as keyof HubRowFieldPatch)) return;
      setHubRowPatches((prev) => {
        const next = new Map(prev);
        const cur = next.get(id) ?? {};
        next.set(id, { ...cur, [field]: value } as HubRowFieldPatch);
        return next;
      });
    },
    []
  );

  const handleHubQuarterDraftChange = useCallback(
    (
      id: string,
      quarter: string,
      field: keyof AdminQuarterData,
      value: string | number | boolean | undefined
    ) => {
      setHubQuarterPatches((prev) => {
        const next = new Map(prev);
        const byQuarter = next.get(id) ?? {};
        const quarterPatch = { ...(byQuarter[quarter] ?? {}), [field]: value };
        next.set(id, { ...byQuarter, [quarter]: quarterPatch });
        return next;
      });
    },
    []
  );

  const handleHubInitiativeGeoCostSplitDraft = useCallback(
    (id: string, split: GeoCostSplit | undefined) => {
      setHubRowPatches((prev) => {
        const next = new Map(prev);
        const cur = next.get(id) ?? {};
        const geo = split?.entries?.length ? split : undefined;
        let patch: HubRowFieldPatch = {
          ...cur,
          initiativeGeoCostSplit: geo,
        };
        if (split?.entries?.length) {
          patch = {
            ...patch,
            stakeholdersList: stakeholdersListFromGeoSplit(split.entries, countryIdToClusterKey),
          };
        } else {
          const { stakeholdersList: _d, ...rest } = patch;
          patch = rest as HubRowFieldPatch;
        }
        if (Object.keys(patch).length > 0) next.set(id, patch);
        else next.delete(id);
        return next;
      });
    },
    [countryIdToClusterKey]
  );

  const handleHubAddPendingRow = useCallback(() => {
    const u = selectedUnits[0] ?? '';
    const t = selectedTeams[0] ?? '';
    const quarterlyData: Record<string, AdminQuarterData> = {};
    quarters.forEach((q) => {
      quarterlyData[q] = { ...createEmptyQuarterData(), effortCoefficient: 0 };
    });
    const id = `${HUB_LOCAL_ROW_PREFIX}${crypto.randomUUID()}`;
    const row: AdminDataRow = {
      id,
      unit: u,
      team: t,
      initiative: 'Новая инициатива',
      isNew: true,
      stakeholdersList: [],
      description: '',
      documentationLink: '',
      stakeholders: '',
      isTimelineStub: false,
      quarterlyData,
    };
    setHubPendingRows((prev) => [row, ...prev]);
    setMatrixFocusInitiativeId(id);
  }, [quarters, selectedUnits, selectedTeams]);

  const handleHubDeleteRow = useCallback((id: string) => {
    if (isHubLocalRowId(id)) {
      setHubPendingRows((prev) => prev.filter((r) => r.id !== id));
      setHubRowPatches((prev) => {
        const n = new Map(prev);
        n.delete(id);
        return n;
      });
      setHubQuarterPatches((prev) => {
        const n = new Map(prev);
        n.delete(id);
        return n;
      });
      setMatrixFocusInitiativeId((cur) => (cur === id ? null : cur));
      return;
    }
    setHubDeletedIds((prev) => new Set(prev).add(id));
    setHubRowPatches((prev) => {
      const n = new Map(prev);
      n.delete(id);
      return n;
    });
    setHubQuarterPatches((prev) => {
      const n = new Map(prev);
      n.delete(id);
      return n;
    });
  }, []);

  const persistHubDraftToServer = useCallback(async (): Promise<boolean> => {
    const previewQs = [...quickFillQuarters].filter((q) => quarters.includes(q)).sort(compareQuarters);
    const previewById =
      previewQs.length > 0 && hubDisplayData.length > 0
        ? buildQuarterlyDataFromPreview(hubDisplayData, previewQs)
        : null;

    const needsStructural =
      hubDraftDirty ||
      hubDeletedIds.size > 0 ||
      hubPendingRows.length > 0;

    const baselineById = new Map(filteredData.map((r) => [r.id, r]));
    let needsPreviewQuarterWrite = false;
    if (previewById) {
      for (const merged of hubDisplayData) {
        if (isHubLocalRowId(merged.id)) continue;
        if (hubDeletedIds.has(merged.id)) continue;
        const baseline = baselineById.get(merged.id);
        if (!baseline) continue;
        const quarterlyToPersist = previewById.get(merged.id) ?? merged.quarterlyData;
        if (
          JSON.stringify(quarterlyDataToJson(baseline.quarterlyData)) !==
          JSON.stringify(quarterlyDataToJson(quarterlyToPersist))
        ) {
          needsPreviewQuarterWrite = true;
          break;
        }
      }
    }

    if (!needsStructural && !needsPreviewQuarterWrite) return false;

    const est =
      hubDeletedIds.size + hubPendingRows.length + hubDisplayData.filter((r) => !isHubLocalRowId(r.id)).length;
    beginBulkInitiativeMutations(Math.max(4, est * 2));
    try {
      for (const id of hubDeletedIds) {
        if (!isHubLocalRowId(id)) {
          await deleteInitiative(id);
        }
      }

      const pendingMerged = hubDisplayData.filter((r) => isHubLocalRowId(r.id));
      for (const merged of pendingMerged) {
        const { id: _tempId, ...rest } = merged;
        const payload: Omit<AdminDataRow, 'id'> = {
          unit: rest.unit,
          team: rest.team,
          initiative: rest.initiative,
          stakeholdersList: rest.stakeholdersList,
          description: rest.description,
          documentationLink: rest.documentationLink,
          stakeholders: rest.stakeholders,
          isTimelineStub: rest.isTimelineStub ?? false,
          quarterlyData: previewById?.get(merged.id) ?? rest.quarterlyData,
          initiativeGeoCostSplit: rest.initiativeGeoCostSplit,
        };
        const created = await createInitiative(payload);
        const nid = (created as { id?: string })?.id;
        if (nid) {
          const savedRow: AdminDataRow = { ...merged, id: nid };
          for (const q of quarters) {
            const eff = savedRow.quarterlyData[q]?.effortCoefficient ?? 0;
            if (eff > 0) await syncAssignments(savedRow, q, eff);
          }
        }
      }

      const scalarKeys: (keyof HubRowFieldPatch)[] = [
        'initiative',
        'stakeholdersList',
        'description',
        'documentationLink',
        'isTimelineStub',
      ];

      for (const merged of hubDisplayData) {
        if (isHubLocalRowId(merged.id)) continue;
        if (hubDeletedIds.has(merged.id)) continue;
        const baseline = baselineById.get(merged.id);
        if (!baseline) continue;

        const quarterlyToPersist = previewById?.get(merged.id) ?? merged.quarterlyData;
        const qEqual =
          JSON.stringify(quarterlyDataToJson(baseline.quarterlyData)) ===
          JSON.stringify(quarterlyDataToJson(quarterlyToPersist));
        if (!qEqual) {
          await updateQuarterDataBulkAsync(merged.id, quarterlyToPersist);
          for (const q of quarters) {
            const be = baseline.quarterlyData[q]?.effortCoefficient ?? 0;
            const me = merged.quarterlyData[q]?.effortCoefficient ?? 0;
            if (be !== me && typeof me === 'number' && me > 0) {
              await syncAssignments(merged, q, me);
            }
          }
        }

        for (const k of scalarKeys) {
          if (baseline[k] !== merged[k]) {
            await updateInitiativeFieldAsync(merged.id, k as string, merged[k] as never);
          }
        }

        const geoEq =
          JSON.stringify(baseline.initiativeGeoCostSplit ?? null) ===
          JSON.stringify(merged.initiativeGeoCostSplit ?? null);
        if (!geoEq) {
          await updateInitiativeFieldAsync(
            merged.id,
            'initiativeGeoCostSplit',
            merged.initiativeGeoCostSplit
          );
        }
      }

      resetHubDraft();
      if (hubDraftStorageKeyResolved) clearPortfolioHubDraft(hubDraftStorageKeyResolved);
      return true;
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось сохранить',
        description: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      finalizeBulkInitiativeMutations();
    }
  }, [
    hubDraftDirty,
    hubDeletedIds,
    hubPendingRows,
    hubDisplayData,
    filteredData,
    quarters,
    quickFillQuarters,
    compareQuarters,
    createInitiative,
    deleteInitiative,
    updateQuarterDataBulkAsync,
    updateInitiativeFieldAsync,
    syncAssignments,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
    resetHubDraft,
    toast,
    hubDraftStorageKeyResolved,
  ]);

  const handleHubPanelSave = useCallback(async () => {
    const hadUnsavedDraft = hubDraftDirty;
    const block = hubActiveAckBlock;
    setHubPanelSaveBusy(true);
    let didSetAck = false;
    try {
      const persisted = await persistHubDraftToServer();
      const { data: freshRows } = await refetch();
      const rowsAfter = freshRows ?? filteredData;
      const uid = user?.id;
      const quarter = getCurrentQuarter();
      const unit = selectedUnits[0] ?? '';
      const team = selectedTeams[0] ?? '';
      let ackForCompletion = hubAckByBlock;
      if (
        block &&
        unit &&
        team &&
        !portfolioHubBlockIncomplete(block, rowsAfter, quarters)
      ) {
        const at = await upsertHubBlockAckForQuarter(unit, team, quarter, block);
        ackForCompletion = { ...ackForCompletion, [block]: at };
        setHubAckByBlock(ackForCompletion);
        didSetAck = true;
      }
      setHubAckRefresh((k) => k + 1);
      if (uid && isPortfolioHubFullyDoneForQuarter(rowsAfter, quarters, ackForCompletion)) {
        if (!wasPortfolioHubCelebrationShown(uid, quarter)) {
          setHubCompletionCelebrationOpen(true);
        }
      }
      if ((hadUnsavedDraft || persisted) && didSetAck) {
        toast({ title: 'Сохранено, данные актуальны' });
      } else if (hadUnsavedDraft || persisted) {
        toast({
          title: 'Сохранено',
          description: 'Изменения записаны в базу.',
        });
      } else if (didSetAck) {
        toast({ title: 'Данные актуальны' });
      }
    } catch {
      return;
    } finally {
      setHubPanelSaveBusy(false);
    }
  }, [
    hubDraftDirty,
    hubActiveAckBlock,
    hubAckByBlock,
    persistHubDraftToServer,
    user?.id,
    filteredData,
    quarters,
    refetch,
    selectedUnits,
    selectedTeams,
    toast,
  ]);

  const handleHubNavDiscard = useCallback(() => {
    const pending = hubNavPending;
    if (!pending) return;
    resetHubDraft();
    if (hubDraftStorageKeyResolved) clearPortfolioHubDraft(hubDraftStorageKeyResolved);
    setHubPanelOpen(pending.target);
    setHubNavPending(null);
  }, [hubNavPending, resetHubDraft, hubDraftStorageKeyResolved]);

  const handleHubNavSaveAndGo = useCallback(async () => {
    const pending = hubNavPending;
    if (!pending) return;
    const block = hubActiveAckBlock;
    const hadUnsavedDraft = hubDraftDirty;
    setHubPanelSaveBusy(true);
    let didSetAck = false;
    try {
      const persisted = await persistHubDraftToServer();
      const { data: freshRows } = await refetch();
      const rowsAfter = freshRows ?? filteredData;
      const uid = user?.id;
      const quarter = getCurrentQuarter();
      const unit = selectedUnits[0] ?? '';
      const team = selectedTeams[0] ?? '';
      let ackForCompletion = hubAckByBlock;
      if (
        block &&
        unit &&
        team &&
        !portfolioHubBlockIncomplete(block, rowsAfter, quarters)
      ) {
        const at = await upsertHubBlockAckForQuarter(unit, team, quarter, block);
        ackForCompletion = { ...ackForCompletion, [block]: at };
        setHubAckByBlock(ackForCompletion);
        didSetAck = true;
      }
      setHubAckRefresh((k) => k + 1);
      if (uid && isPortfolioHubFullyDoneForQuarter(rowsAfter, quarters, ackForCompletion)) {
        if (!wasPortfolioHubCelebrationShown(uid, quarter)) {
          setHubCompletionCelebrationOpen(true);
        }
      }
      if ((hadUnsavedDraft || persisted) && didSetAck) {
        toast({ title: 'Сохранено, данные актуальны' });
      } else if (hadUnsavedDraft || persisted) {
        toast({
          title: 'Сохранено',
          description: 'Изменения записаны в базу.',
        });
      } else if (didSetAck) {
        toast({ title: 'Данные актуальны' });
      }
      setHubPanelOpen(pending.target);
      setHubNavPending(null);
    } catch {
      return;
    } finally {
      setHubPanelSaveBusy(false);
    }
  }, [
    hubNavPending,
    hubActiveAckBlock,
    hubAckByBlock,
    hubDraftDirty,
    persistHubDraftToServer,
    refetch,
    filteredData,
    quarters,
    selectedUnits,
    selectedTeams,
    toast,
  ]);

  const handleHubCelebrationDismiss = useCallback(() => {
    const uid = user?.id;
    if (uid) {
      setPortfolioHubCelebrationShown(uid, getCurrentQuarter());
    }
    setHubCompletionCelebrationOpen(false);
  }, [user?.id]);

  /** Восстановление черновика при открытии хаба после полного закрытия. */
  useEffect(() => {
    if (hubPanelOpen === null) {
      hubSessionClosedRef.current = true;
      return;
    }
    const key = hubDraftStorageKeyResolved;
    const uid = user?.id;
    if (!uid || !key) return;
    if (!hubSessionClosedRef.current) return;
    hubSessionClosedRef.current = false;
    const loaded = loadPortfolioHubDraft(key);
    if (!loaded) return;
    const d = draftStateFromSnapshot(loaded);
    setHubRowPatches(d.rowPatches);
    setHubQuarterPatches(d.quarterPatches);
    setHubPendingRows(d.pendingRows);
    setHubDeletedIds(d.deletedIds);
  }, [hubPanelOpen, user?.id, hubDraftStorageKeyResolved]);

  /** Автосохранение черновика в localStorage (пока открыт хаб и есть несохранённое). */
  useEffect(() => {
    if (hubPanelOpen === null || !hubDraftStorageKeyResolved || !hubDraftDirty) return;
    const t = window.setTimeout(() => {
      savePortfolioHubDraft(
        hubDraftStorageKeyResolved,
        snapshotFromDraftState({
          rowPatches: hubRowPatches,
          quarterPatches: hubQuarterPatches,
          pendingRows: hubPendingRows,
          deletedIds: hubDeletedIds,
        })
      );
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    hubPanelOpen,
    hubDraftStorageKeyResolved,
    hubDraftDirty,
    hubRowPatches,
    hubQuarterPatches,
    hubPendingRows,
    hubDeletedIds,
  ]);

  /** Предупреждение при закрытии вкладки с несохранённым черновиком хаба. */
  useEffect(() => {
    if (hubPanelOpen === null || !hubDraftDirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [hubPanelOpen, hubDraftDirty]);

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

  const applyQuickRowPatches = useCallback((rows: AdminDataRow[], patches: Map<string, QuickFlowRowPatch>) => {
    if (patches.size === 0) return rows;
    return rows.map((row) => {
      const p = patches.get(row.id);
      return p ? { ...row, ...p } : row;
    });
  }, []);

  /** Строки, добавленные в quick flow, — сверху; внутри группы порядок: новее выше. */
  const sortQuickMatrixRows = useCallback((rows: AdminDataRow[], createdIds: string[]) => {
    if (createdIds.length === 0) return rows;
    const order = new Map(createdIds.map((id, i) => [id, i]));
    const quick: AdminDataRow[] = [];
    const rest: AdminDataRow[] = [];
    for (const row of rows) {
      if (order.has(row.id)) quick.push(row);
      else rest.push(row);
    }
    quick.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    return [...quick, ...rest];
  }, []);

  const quickDisplayData = useMemo(() => {
    const withRow = applyQuickRowPatches(filteredData, quickRowPatches);
    const patched = applyQuickDraftPatches(withRow, quickDraftPatches);
    return sortQuickMatrixRows(patched, createdInQuickSession);
  }, [
    filteredData,
    quickDraftPatches,
    quickRowPatches,
    createdInQuickSession,
    applyQuickDraftPatches,
    applyQuickRowPatches,
    sortQuickMatrixRows,
  ]);

  const handleQuickInitiativeDraftChange = useCallback(
    (id: string, field: keyof QuickFlowRowPatch, value: string | string[] | boolean) => {
      setQuickRowPatches((prev) => {
        const next = new Map(prev);
        const cur = next.get(id) ?? {};
        next.set(id, { ...cur, [field]: value } as QuickFlowRowPatch);
        return next;
      });
    },
    []
  );

  /** Кварталы, где в черновике менялись коэффициенты усилий (для шага 4: лист vs база). */
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

  /** Совпадает ли выгрузка с фильтром: иначе это keepPreviousData от прошлого запроса. */
  const quickCoeffDataMatchesSelection = useMemo(() => {
    const us = selectedUnits.map((x) => x.trim()).filter(Boolean);
    const ts = selectedTeams.map((x) => x.trim()).filter(Boolean);
    if (filteredData.length === 0) return true;
    if (us.length === 0 && ts.length === 0) return true;
    const uset = new Set(us);
    const tset = new Set(ts);
    return filteredData.every((r) => {
      const ru = (r.unit ?? '').trim();
      const rt = (r.team ?? '').trim();
      const uOk = uset.size === 0 || uset.has(ru);
      const tOk = tset.size === 0 || tset.has(rt);
      return uOk && tOk;
    });
  }, [filteredData, selectedUnits, selectedTeams]);

  const quickCoeffRowSetSignature = useMemo(
    () =>
      [...filteredData]
        .map((r) => r.id)
        .sort()
        .join('\u001f'),
    [filteredData]
  );

  const quickCoeffBaselineSnapshotKey = useMemo(
    () =>
      [
        selectedUnits.join('\u001f'),
        selectedTeams.join('\u001f'),
        String(quickTeamQueue?.currentIndex ?? -1),
        quickTeamQueue?.unit ?? '',
        currentQueueTeam,
        quickFillQuarters.join(','),
        quickCoeffRowSetSignature,
      ].join('|'),
    [
      selectedUnits,
      selectedTeams,
      quickTeamQueue?.currentIndex,
      quickTeamQueue?.unit,
      currentQueueTeam,
      quickFillQuarters,
      quickCoeffRowSetSignature,
    ]
  );

  /**
   * Снимок строк команды при первом входе на шаг «коэффициенты» (до черновика).
   * Новые инициативы в сеансе в «до» не попадают; при смене ключа (команда/кварталы) — новый снимок.
   * Не фиксируем снимок на keepPreviousData: ключ меняется с selection раньше, чем приходят строки новой команды.
   */
  const quickCoefficientsBaselineStore = useRef<{ key: string; rows: AdminDataRow[] } | null>(null);
  if (!isQuickMode || !canShowQuick || needsRosterPreflight) {
    quickCoefficientsBaselineStore.current = null;
  } else if (quickStep === coeffQuickStepIndex) {
    const k = quickCoeffBaselineSnapshotKey;
    if (!quickCoefficientsBaselineStore.current || quickCoefficientsBaselineStore.current.key !== k) {
      if (quickCoeffDataMatchesSelection) {
        quickCoefficientsBaselineStore.current = { key: k, rows: structuredClone(filteredData) };
      }
    }
  }
  const quickCoefficientsBaselineRows =
    quickCoefficientsBaselineStore.current?.key === quickCoeffBaselineSnapshotKey &&
    quickCoeffDataMatchesSelection
      ? quickCoefficientsBaselineStore.current.rows
      : filteredData;

  const handleQuickDraftChange = useCallback((
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | undefined
  ) => {
    setQuickDraftPatches((prev) => {
      const next = new Map(prev);
      const byQuarter = next.get(id) ?? {};
      const quarterPatch = { ...(byQuarter[quarter] ?? {}), [field]: value };
      next.set(id, { ...byQuarter, [quarter]: quarterPatch });
      return next;
    });
  }, []);

  const handleQuickGeoCostSplitDraft = useCallback(
    (id: string, split: GeoCostSplit | undefined) => {
      setQuickRowPatches((prev) => {
        const next = new Map(prev);
        const cur = next.get(id) ?? {};
        const geo = split?.entries?.length ? split : undefined;
        let patch: QuickFlowRowPatch = {
          ...cur,
          initiativeGeoCostSplit: geo,
        };
        if (split?.entries?.length) {
          patch = {
            ...patch,
            stakeholdersList: stakeholdersListFromGeoSplit(split.entries, countryIdToClusterKey),
          };
        } else {
          const { stakeholdersList: _d, ...rest } = patch;
          patch = rest as QuickFlowRowPatch;
        }
        if (Object.keys(patch).length > 0) next.set(id, patch);
        else next.delete(id);
        return next;
      });
    },
    [countryIdToClusterKey]
  );

  const handleSaveQuickDraft = useCallback(async (opts?: { silent?: boolean }) => {
    if (quickDraftPatches.size === 0 && quickRowPatches.size === 0) return;
    setIsSavingQuickDraft(true);
    let fieldWriteMutations = 0;
    for (const patch of quickRowPatches.values()) {
      for (const key of Object.keys(patch) as (keyof QuickFlowRowPatch)[]) {
        if (patch[key] !== undefined) fieldWriteMutations += 1;
      }
    }
    const dirtyEffortQs = [...quickDirtyEffortQuarters].sort(compareQuarters);
    const bulkMutationCount =
      dirtyEffortQs.length > 0
        ? quickDisplayData.length + fieldWriteMutations
        : quickDraftPatches.size + fieldWriteMutations;
    beginBulkInitiativeMutations(bulkMutationCount);
    try {
      if (dirtyEffortQs.length > 0) {
        const previewQs = [...quickFillQuarters]
          .filter((q) => quarters.includes(q))
          .sort(compareQuarters);
        const effectivePreview =
          previewQs.length > 0 ? previewQs : [...dirtyEffortQs].sort(compareQuarters);
        const dataById = buildQuarterlyDataFromPreview(quickDisplayData, effectivePreview);
        for (const row of quickDisplayData) {
          const merged = dataById.get(row.id)!;
          await updateQuarterDataBulkAsync(row.id, merged);
        }
        for (const [id, byQuarter] of quickDraftPatches) {
          for (const [q, patch] of Object.entries(byQuarter)) {
            if (patch.effortCoefficient !== undefined) {
              const baseRow = rawData.find((r) => r.id === id);
              if (!baseRow) continue;
              const disp = quickDisplayData.find((r) => r.id === id);
              const updatedRow: AdminDataRow = {
                ...baseRow,
                ...disp,
                quarterlyData: dataById.get(id)!,
              };
              await syncAssignments(updatedRow, q, patch.effortCoefficient as number);
            }
          }
        }
      } else {
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
      }

      for (const [id, patch] of quickRowPatches) {
        for (const key of Object.keys(patch) as (keyof QuickFlowRowPatch)[]) {
          const value = patch[key];
          if (value === undefined) continue;
          await updateInitiativeFieldAsync(id, key as string, value);
        }
      }
      setQuickDraftPatches(new Map());
      setQuickRowPatches(new Map());
      if (!opts?.silent) toast({ title: 'Данные сохранены' });
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      finalizeBulkInitiativeMutations();
      setIsSavingQuickDraft(false);
    }
  }, [
    quickDraftPatches,
    quickRowPatches,
    quickDirtyEffortQuarters,
    quickDisplayData,
    quickFillQuarters,
    quarters,
    rawData,
    updateQuarterDataBulkAsync,
    updateInitiativeFieldAsync,
    syncAssignments,
    toast,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
  ]);

  /**
   * Перед шагом «Проверьте описание…» (кнопка «Далее» после сравнения treemap): записываем в БД стоимости как в превью treemap
   * (доли от бюджета команды), с costFinanceConfirmed=false на кварталах сценария — иначе на следующих шагах и в дашборде остаются старые суммы.
   */
  const persistQuickFlowPreviewCostsBeforeTimeline = useCallback(async () => {
    const previewQs = [...quickFillQuarters].filter((q) => quarters.includes(q)).sort(compareQuarters);
    if (previewQs.length === 0 || quickDisplayData.length === 0) return;

    const dataById = buildQuarterlyDataFromPreview(quickDisplayData, previewQs);
    const persistWriteCount = quickDisplayData.reduce(
      (n, row) => n + (dataById.get(row.id) ? 1 : 0),
      0
    );
    setIsSavingQuickDraft(true);
    beginBulkInitiativeMutations(persistWriteCount);
    try {
      for (const row of quickDisplayData) {
        const merged = dataById.get(row.id);
        if (!merged) continue;
        await updateQuarterDataBulkAsync(row.id, merged);
      }
      for (const [id, byQuarter] of quickDraftPatches) {
        for (const [q, patch] of Object.entries(byQuarter)) {
          if (patch.effortCoefficient !== undefined) {
            const baseRow = rawData.find((r) => r.id === id);
            if (!baseRow) continue;
            const disp = quickDisplayData.find((r) => r.id === id);
            const updatedRow: AdminDataRow = {
              ...baseRow,
              ...disp,
              quarterlyData: dataById.get(id)!,
            };
            await syncAssignments(updatedRow, q, patch.effortCoefficient as number);
          }
        }
      }
    } catch (e) {
      toast({
        title: 'Не удалось сохранить предварительные стоимости',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      throw e;
    } finally {
      finalizeBulkInitiativeMutations();
      setIsSavingQuickDraft(false);
    }
  }, [
    quickDisplayData,
    quickFillQuarters,
    quarters,
    quickDraftPatches,
    rawData,
    updateQuarterDataBulkAsync,
    syncAssignments,
    toast,
    beginBulkInitiativeMutations,
    finalizeBulkInitiativeMutations,
  ]);

  const handleSheetsPreviewCalculation = useCallback(async () => {
    const previewQuarterEfforts: Record<string, Record<string, number>> = {};
    for (const row of quickDisplayData) {
      const byQ: Record<string, number> = {};
      for (const q of quickFillQuarters) {
        const eff = row.quarterlyData[q]?.effortCoefficient;
        if (eff === undefined || eff === null) continue;
        byQ[q] = Number(eff);
      }
      if (Object.keys(byQ).length > 0) {
        previewQuarterEfforts[row.id] = byQ;
      }
    }
    return invokeEdgeFunction('sheets-preview-calculation', {
      previewQuarterEfforts,
      maxWaitMs: 12000,
    }) as Promise<{
      preview?: { initiativeId: string; initiativeName?: string; itog: Record<string, number> }[];
      pollStable?: boolean;
      message?: string;
    }>;
  }, [quickDisplayData, quickFillQuarters]);

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

  const handleRequestExitQuick = useCallback((_action: 'backToStep1', onProceed: () => void) => {
    if (quickDraftPatches.size === 0 && quickRowPatches.size === 0) {
      onProceed();
      return;
    }
    setExitConfirmState({ onProceed });
  }, [quickDraftPatches.size, quickRowPatches.size]);

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
    setQuickRowPatches(new Map());
    setExitConfirmState(null);
    onProceed?.();
  }, [exitConfirmState]);

  /** Таблица заполнения (админка): без юнита — все строки; юнит без команды — все команды юнита; юнит+команда — узкий фильтр.
   *  Супер-админ: не сужаем по организационному профилю — полный портфель (как без member_unit). */
  const handleOpenFullFillTable = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('mode');
        if (isSuperAdmin) {
          p.set('table', 'all');
          p.delete('units');
          p.delete('teams');
          return p;
        }
        const d = fillDefaultUnitTeam(fillAccessCtx, scopeCatalogData);
        if (!d.unit || !d.team) {
          toast({
            title: 'Нет доступной области',
            description: 'Задайте доступ к юниту или команде на вкладке «Доступы», затем откройте таблицу снова.',
            variant: 'destructive',
          });
          return p;
        }
        p.delete('table');
        p.set('units', d.unit);
        p.set('teams', d.team);
        return p;
      },
      { replace: true }
    );
  }, [isSuperAdmin, fillAccessCtx, scopeCatalogData, setSearchParams, toast]);

  const scopeOnUnitsChange = useCallback(
    (next: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('table');
          if (next.length > 0) p.set('units', next.join(','));
          else p.delete('units');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const scopeOnTeamsChange = useCallback(
    (next: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('table');
          if (next.length > 0) p.set('teams', next.join(','));
          else p.delete('teams');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const scopeOnFiltersChange = useCallback(
    (nextU: string[], nextT: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('table');
          if (nextU.length > 0) p.set('units', nextU.join(','));
          else p.delete('units');
          if (nextT.length > 0) p.set('teams', nextT.join(','));
          else p.delete('teams');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Data modification handlers
  const handleDataChange = useCallback(
    (id: string, field: keyof AdminDataRow, value: string | string[] | number | boolean) => {
      /** Название без debounce: иначе refetch после create/инвалидации перезаписывает кэш до flush таймера — ввод «ломается». */
      if (field === 'initiative' && typeof value === 'string') {
        immediateUpdate(id, field, value);
        return;
      }
      const delay = Array.isArray(value) || typeof value === 'boolean' ? 0 : 300;
      updateInitiative(id, field, value, delay);
    },
    [updateInitiative, immediateUpdate]
  );

  const handleQuarterDataChange = useCallback(
    (
      id: string,
      quarter: string,
      field: keyof AdminQuarterData,
      value: string | number | boolean | undefined
    ) => {
      updateQuarterData(id, quarter, field, value);
    },
    [updateQuarterData]
  );

  const handleInitiativeGeoCostSplitChange = useCallback(
    (id: string, split: GeoCostSplit | undefined) => {
      updateInitiativeGeoCostSplit(id, split);
      if (split?.entries?.length) {
        const sh = stakeholdersListFromGeoSplit(split.entries, countryIdToClusterKey);
        updateInitiative(id, 'stakeholdersList', sh, 0);
      }
    },
    [updateInitiativeGeoCostSplit, updateInitiative, countryIdToClusterKey]
  );

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

  /** Quick flow, шаг коэффициентов: новая строка с черновым названием; переименование и % — в таблице / карточке. */
  const handleQuickAddInitiativeRow = useCallback(async () => {
    const u = selectedUnits[0] ?? '';
    const t = selectedTeams[0] ?? '';
    const quarterlyData: Record<string, AdminQuarterData> = {};
    quarters.forEach((q) => {
      quarterlyData[q] = { ...createEmptyQuarterData(), effortCoefficient: 0 };
    });
    try {
      const result = await createInitiative({
        unit: u,
        team: t,
        initiative: 'Новая инициатива',
        stakeholdersList: [],
        description: '',
        documentationLink: '',
        stakeholders: '',
        isTimelineStub: false,
        quarterlyData,
      });
      const createdId = (result as { id?: string })?.id;
      if (createdId) {
        setCreatedInQuickSession((prev) => [createdId, ...prev.filter((x) => x !== createdId)]);
        setMatrixFocusInitiativeId(createdId);
      }
      toast({
        title: 'Инициатива добавлена',
      });
    } catch (err) {
      console.error('Failed to create initiative:', err);
    }
  }, [quarters, selectedUnits, selectedTeams, createInitiative, toast]);

  const handleGoToFullTable = useCallback(() => {
    setCreatedInQuickSession([]);
    clearQuickTeamQueue();
    setQuickTeamQueue(null);
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('mode');
      n.delete('quickQuarterFrom');
      n.delete('quickQuarterTo');
      n.delete('quickQuarter');
      n.delete('quickQs');
      return n;
    }, { replace: true });
  }, [setSearchParams]);

  const handleQuickCompletionCelebrationDismiss = useCallback(() => {
    setQuickCompletionCelebrationOpen(false);
    const fn = quickExitAfterCelebrationRef.current;
    quickExitAfterCelebrationRef.current = null;
    fn?.();
  }, []);

  const handleSaveAndContinueOrFinish = useCallback(async () => {
    const q = quickTeamQueue ?? readQuickTeamQueue();
    setQueueActionLoading(true);
    try {
      if (quickDraftPatches.size > 0 || quickRowPatches.size > 0) {
        await handleSaveQuickDraft({ silent: true });
      }
      if (!q || q.teams.length === 0) {
        quickExitAfterCelebrationRef.current = () => {
          handleGoToFullTable();
          toast({ title: 'Готово', description: 'Сценарий завершён.' });
        };
        setQuickCompletionCelebrationOpen(true);
        return;
      }
      const nextIdx = q.currentIndex + 1;
      if (nextIdx >= q.teams.length) {
        quickExitAfterCelebrationRef.current = () => {
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
            p.delete('quickQuarterFrom');
            p.delete('quickQuarterTo');
            p.delete('quickQuarter');
            p.delete('quickQs');
            return p;
          });
          toast({ title: 'Готово', description: 'Все выбранные команды пройдены.' });
        };
        setQuickCompletionCelebrationOpen(true);
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
        p.delete('quickQs');
        p.delete('table');
        return p;
      });
      toast({ title: 'Сохранено', description: `Следующая команда: ${q.teams[nextIdx]}` });
    } finally {
      setQueueActionLoading(false);
    }
  }, [
    quickDraftPatches,
    quickRowPatches,
    quickTeamQueue,
    handleSaveQuickDraft,
    handleGoToFullTable,
    toast,
    setSearchParams,
  ]);

  const handleQuickSetupStart = useCallback(
    (unit: string, teamsInOrder: string[]) => {
      const q = initQuickTeamQueue(unit, teamsInOrder);
      writeQuickTeamQueue(q);
      setQuickTeamQueue(q);
      setShowQuickSetup(false);
      setQuickStep(1);
      setQuickDraftPatches(new Map());
      setQuickRowPatches(new Map());
      setCreatedInQuickSession([]);
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete('table');
        p.delete('quickQuarterFrom');
        p.delete('quickQuarterTo');
        p.delete('quickQuarter');
        p.delete('quickQs');
        p.set('units', unit);
        p.set('teams', teamsInOrder[0]);
        p.set('mode', 'quick');
        return p;
      });
    },
    [setSearchParams]
  );

  const handleConfirmRosterPreflight = useCallback(() => {
    setQuickTeamQueue((prev) => {
      if (!prev) return prev;
      const team = prev.teams[prev.currentIndex];
      if (!team) return prev;
      const next: QuickTeamQueueState = {
        ...prev,
        rosterPreflightDoneByTeam: { ...prev.rosterPreflightDoneByTeam, [team]: true },
      };
      writeQuickTeamQueue(next);
      return next;
    });
  }, []);

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

  /** Удаление из БД с шага «коэффициенты» quick flow (любая строка команды, не только добавленная в сеансе). */
  const handleDeleteInitiativeAddedInQuickSession = useCallback(
    async (id: string) => {
      const row = quickDisplayData.find((r) => r.id === id);
      const name =
        row?.initiative?.trim() || rawData.find((r) => r.id === id)?.initiative?.trim() || '—';
      try {
        await deleteInitiative(id);
        setCreatedInQuickSession((prev) => prev.filter((x) => x !== id));
        setQuickDraftPatches((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setQuickRowPatches((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setQuickFillInitiativeId((cur) => (cur === id ? null : cur));
        toast({
          title: 'Инициатива удалена',
          description: `«${name}» больше не отображается в списке.`,
        });
      } catch (err) {
        console.error('Failed to delete initiative from quick flow:', err);
        toast({
          variant: 'destructive',
          title: 'Не удалось удалить',
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [quickDisplayData, rawData, deleteInitiative, toast]
  );

  // Export handlers
  const handleDownloadAll = useCallback(() => {
    exportAll(rawData);
  }, [rawData, exportAll]);

  const handleDownloadFiltered = useCallback(() => {
    exportFiltered(filteredData);
  }, [filteredData, exportFiltered]);

  const handleDownloadGeoAll = useCallback(() => {
    exportGeoSplitAll(rawData);
  }, [rawData, exportGeoSplitAll]);

  const handleDownloadGeoFiltered = useCallback(() => {
    exportGeoSplitFiltered(filteredData);
  }, [filteredData, exportGeoSplitFiltered]);

  // Только первая загрузка без кэша — не перекрываем весь экран при refetch после сохранений (Quick Flow)
  if (isPending && initiativesData === undefined && !error) {
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

  /** Не показывать «Назад» на экране выбора юнита/команды, пока scope не собран. */
  const scopePickerIncomplete =
    !isQuickMode &&
    hasData &&
    !adminTableAll &&
    (selectedUnits.length === 0 || selectedTeams.length === 0);

  const showInitiativesStepBack =
    hasData &&
    (previousInitiativesScreen !== null || hubPanelOpen !== null) &&
    !scopePickerIncomplete;

  /**
   * Строка с пикером юнита/команды видна всегда, кроме quick mode и его сетапа,
   * чтобы пользователь мог сразу выбрать scope (даже когда ничего не выбрано).
   */
  const showFillScopeToolbar = hasData && !isQuickMode && !showQuickSetup;
  /** Только «К дашборду» сверху, если нет строки scope (quick / setup). */
  const showAdminFillOnlyTopStrip = !isSuperAdmin && !showFillScopeToolbar;

  return (
    <div className="h-screen w-full min-w-0 bg-background flex flex-col overflow-hidden">
      {isSuperAdmin ? (
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
          onDownloadGeoSplitAll={handleDownloadGeoAll}
          onDownloadGeoSplitFiltered={handleDownloadGeoFiltered}
          onRetry={retry}
        />
      ) : showAdminFillOnlyTopStrip ? (
        <div className="flex h-12 w-full min-w-0 shrink-0 items-center border-b border-border bg-header px-2 sm:px-4">
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2 sm:px-3" asChild>
            <Link to="/" aria-label="К дашборду">
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline text-sm font-medium">К дашборду</span>
            </Link>
          </Button>
        </div>
      ) : null}

      {isAdmin && hasData && SHOW_GOOGLE_SHEETS_SYNC_STRIP_UI ? (
        <GoogleSheetsSyncStrip onAfterImport={() => refetch()} />
      ) : null}

      <main className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
        <AdminQuickFlowPortfolioFilledCelebration
          open={quickCompletionCelebrationOpen}
          onDismiss={handleQuickCompletionCelebrationDismiss}
        />
        <AdminQuickFlowPortfolioFilledCelebration
          open={hubCompletionCelebrationOpen}
          onDismiss={handleHubCelebrationDismiss}
        />
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
          <div className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
            {showFillScopeToolbar && (
              <div className="flex min-w-0 shrink-0 items-stretch gap-2 border-b border-border bg-muted/20 px-2 py-2 sm:gap-3 sm:px-4">
                {!isSuperAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 self-center px-2 sm:px-3"
                    asChild
                  >
                    <Link to="/" aria-label="К дашборду">
                      <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="hidden sm:inline text-sm font-medium">К дашборду</span>
                    </Link>
                  </Button>
                ) : null}
                {showInitiativesStepBack ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 self-center text-muted-foreground hover:text-foreground"
                    onClick={handleInitiativesBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Назад
                  </Button>
                ) : null}
                <div className="min-w-0 flex-1 self-center">
                  <ScopeSelector
                    units={fillUnitOptions}
                    teams={fillScopeTeamOptions}
                    selectedUnits={selectedUnits}
                    selectedTeams={selectedTeams}
                    onUnitsChange={scopeOnUnitsChange}
                    onTeamsChange={scopeOnTeamsChange}
                    onFiltersChange={scopeOnFiltersChange}
                    allData={scopeCatalogData}
                    adminViewAll={adminTableAll && selectedUnits.length === 0}
                    selectionMode="single"
                    lockUnit={fillLocks.lockUnit}
                    lockTeam={fillLocks.lockTeam}
                  />
                </div>
                {hubPanelOpen ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-center">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={hubSaveStatusBoxClass}
                        title={hubSaveStatusTitle}
                        role="status"
                        aria-label={hubSaveStatusTitle}
                      >
                        {hubSaveStatusIcon}
                      </span>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-9 shrink-0 shadow-sm"
                        title="База и отметка просмотра"
                        disabled={hubPanelSaveBusy}
                        onClick={() => void handleHubPanelSave()}
                      >
                        {hubPanelSaveBusy ? 'Сохранение…' : 'Сохранить и подтвердить'}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                      disabled={hubPanelSaveBusy}
                      onClick={handleHubGoNextBlock}
                    >
                      {hubPanelOpen === 'roster' ? (
                        <>
                          Далее: {nextNavCaption('roster')}
                          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                        </>
                      ) : nextHubBlock(hubPanelOpen as PortfolioHubBlock) ? (
                        <>
                          Далее: {nextNavCaption(hubPanelOpen)}
                          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                        </>
                      ) : (
                        <>
                          К обзору
                          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            {needsSelection ? (
              showQuickSetup ? (
                <AdminQuickFlowSetupScreen
                  units={units}
                  rawData={rawData}
                  memberUnit={isSuperAdmin ? null : memberUnit}
                  onStart={handleQuickSetupStart}
                  onTeamsOrderChange={setQuickSetupTeamCount}
                  stepTrack={
                    quickFlowLinearProgress ? (
                      <AdminQuickFlowStepTrack
                        current={quickFlowLinearProgress.current}
                        total={quickFlowLinearProgress.total}
                        onStepBack={showInitiativesStepBack ? handleInitiativesBack : undefined}
                      />
                    ) : null
                  }
                />
              ) : (
                /**
                 * Старт админки без выбора: пикер сверху уже виден с заглушками «Юнит» и «Команда».
                 * Здесь только подсказка, чтобы пользователь сразу понял, что делать.
                 */
                <div className="flex flex-1 min-h-0 w-full flex-col overflow-auto">
                  <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-10">
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground" />
                      <h2 className="mb-2 font-juneau text-lg font-medium">Выберите unit и команду</h2>
                      <p className="text-sm text-muted-foreground">
                        В фильтрах выше задайте unit и команду, чтобы редактировать инициативы.
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : onlyUnitSelected ? (
              <div className="flex flex-1 min-h-0 w-full flex-col overflow-auto">
                <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-10">
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground" />
                    <h2 className="mb-2 font-juneau text-lg font-medium">Выберите одну или несколько команд</h2>
                    <p className="text-sm text-muted-foreground">
                      Чтобы редактировать инициативы и проценты по кварталам, выберите команды в фильтрах выше.
                    </p>
                  </div>
                </div>
              </div>
            ) : isQuickMode && canShowQuick && needsRosterPreflight && quickTeamQueue ? (
              <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-gradient-to-b from-muted/40 via-background to-background">
                <div className="mx-auto flex min-h-0 w-full max-w-none min-w-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5 lg:px-8">
                  <div className="mb-3 flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <AdminQuickFlowStepTrack
                      className="min-w-0 flex-1 pt-0.5"
                      current={quickFlowLinearProgress?.current ?? 1}
                      total={quickFlowLinearProgress?.total}
                      onStepBack={showInitiativesStepBack ? handleInitiativesBack : undefined}
                      unit={quickTeamQueue.unit?.trim() || undefined}
                      team={currentQueueTeam?.trim() || undefined}
                      queueCurrent={
                        quickTeamQueue.teams.length > 0 ? quickTeamQueue.currentIndex + 1 : undefined
                      }
                      queueTotal={
                        quickTeamQueue.teams.length > 0 ? quickTeamQueue.teams.length : undefined
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 self-start sm:mt-0"
                      title="Перейти к коэффициентам"
                      onClick={handleConfirmRosterPreflight}
                    >
                      Далее
                      <ChevronRight size={15} className="shrink-0" aria-hidden />
                    </Button>
                  </div>
                  <AdminQuickFlowRosterStep
                    unit={quickTeamQueue.unit}
                    team={currentQueueTeam}
                    quartersCatalog={quarters}
                  />
                </div>
              </div>
            ) : isQuickMode && canShowQuick ? (
              <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
                <AdminQuickFlow
                suppressRosterStep={suppressRosterInQuickFlow}
                filteredData={quickDisplayData}
                baselineFilteredData={quickCoefficientsBaselineRows}
                quarters={quarters}
                fillQuarters={quickFillQuarters}
                peopleEffortFillTo={peopleEffortFillTo}
                unit={selectedUnits[0] ?? ''}
                team={selectedTeams[0] ?? ''}
                onDeleteInitiativeAddedInQuickFlow={handleDeleteInitiativeAddedInQuickSession}
                step={quickStep}
                setStep={setQuickStep}
                onQuarterDataChange={handleQuickDraftChange}
                onInitiativeDraftChange={handleQuickInitiativeDraftChange}
                onQuickAddInitiativeRow={handleQuickAddInitiativeRow}
                focusMatrixInitiativeId={matrixFocusInitiativeId}
                onFocusMatrixInitiativeConsumed={clearMatrixFocusInitiative}
                onOpenFillInitiative={setQuickFillInitiativeId}
                hasQuickDraft={quickDraftPatches.size > 0 || quickRowPatches.size > 0}
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
                overallStepProgress={quickFlowLinearProgress ?? undefined}
                onFlowStepBack={showInitiativesStepBack ? handleInitiativesBack : undefined}
                marketCountries={marketCountries}
                onGeoCostSplitDraftChange={handleQuickGeoCostSplitDraft}
                onPersistPreviewCostsBeforeTimeline={persistQuickFlowPreviewCostsBeforeTimeline}
                />
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0">
                {hubPanelOpen ? (
                  <AdminPortfolioHubPanels
                    open={hubPanelOpen}
                    onOpenChange={requestHubPanelChange}
                    filteredData={hubDisplayData}
                    quarters={quarters}
                    fillQuarters={quickFillQuarters}
                    peopleEffortFillTo={peopleEffortFillTo}
                    unit={selectedUnits[0] ?? ''}
                    team={selectedTeams[0] ?? ''}
                    marketCountries={marketCountries}
                    onQuarterDataChange={handleHubQuarterDraftChange}
                    onInitiativeGeoCostSplitChange={handleHubInitiativeGeoCostSplitDraft}
                    onInitiativeFieldChange={handleHubRowDraftChange}
                    onAddInitiativeFromMatrix={handleHubAddPendingRow}
                    onDeleteInitiativeFromMatrix={handleHubDeleteRow}
                  />
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <AdminPortfolioFillHub
                      rows={filteredData}
                      quartersCatalog={quarters}
                      selectedUnits={selectedUnits}
                      selectedTeams={selectedTeams}
                      ackByBlock={hubAckByBlock}
                      fillQuarters={quickFillQuarters}
                      marketCountries={marketCountries}
                      onOpenRoster={() => requestHubPanelChange('roster')}
                      onOpenBlock={(block) => requestHubPanelChange(block)}
                    />
                  </div>
                )}
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

      {/* Portfolio hub: несохранённый черновик при смене экрана / шага */}
      <AlertDialog open={hubNavPending !== null} onOpenChange={(open) => !open && setHubNavPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Есть несохранённые правки</AlertDialogTitle>
            <AlertDialogDescription>
              Сохранить в базу и подтвердить просмотр перед переходом?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={handleHubNavDiscard}>
              Не сохранять
            </Button>
            <Button type="button" variant="default" onClick={handleHubNavSaveAndGo} disabled={hubPanelSaveBusy}>
              {hubPanelSaveBusy ? 'Сохранение…' : 'Сохранить и подтвердить'}
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
          onInitiativeGeoCostSplitChange={handleInitiativeGeoCostSplitChange}
        />
      )}

    </div>
  );
};

export default Admin;
