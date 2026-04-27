import { useState, useRef, useEffect, useCallback, useMemo, DragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Upload, RefreshCw } from 'lucide-react';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';
import { Button } from '@/components/ui/button';
import Header, { ViewType } from '@/components/Header';
import FilterBar from '@/components/FilterBar';
import BudgetTreemap from '@/components/BudgetTreemap';
import StakeholdersTreemap from '@/components/StakeholdersTreemap';
import GanttView from '@/components/GanttView';
import { InitiativePeekModal } from '@/components/InitiativePeekModal';
import { LogoLoader } from '@/components/LogoLoader';
import { DashboardDataWarning, SHOW_DASHBOARD_DATA_WARNING } from '@/components/DashboardDataWarning';
import { useAuth } from '@/hooks/useAuth';
import { useRecordDailyPresence } from '@/hooks/useRecordDailyPresence';
import {
  parseCSV,
  convertFromDB,
  buildBudgetTree,
  buildStakeholdersTree,
  RawDataRow,
  TreeNode,
  formatBudget,
  calculateBudget,
  isInitiativeOffTrack,
  type SupportFilter,
} from '@/lib/dataManager';
import { splitTreemapEncodedPath } from '@/lib/treemapPathCodec';
import { useInitiatives } from '@/hooks/useInitiatives';
import { useAccess } from '@/hooks/useAccess';
import { toast } from 'sonner';

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  useRecordDailyPresence('portfolio', !!user);
  const { isAdmin, canAccess, canViewMoney, scope } = useAccess();
  // Fetch data from database
  const { data: dbData, isLoading, error, refetch } = useInitiatives();
  
  // Data state (derived from DB or CSV fallback)
  const [rawData, setRawData] = useState<RawDataRow[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [stakeholderCombinations, setStakeholderCombinations] = useState<string[]>([]);
  const [isUsingCSV, setIsUsingCSV] = useState(false);

  // View state
  const [currentView, setCurrentView] = useState<ViewType>('budget');
  const [portfolioData, setPortfolioData] = useState<TreeNode>({ name: 'Все Unit', children: [], isRoot: true });
  const [stakeholdersData, setStakeholdersData] = useState<TreeNode>({ name: 'Все стейкхолдеры', children: [], isRoot: true });
  const [currentRoot, setCurrentRoot] = useState<TreeNode>({ name: 'Все Unit', children: [], isRoot: true });
  const [navigationStack, setNavigationStack] = useState<TreeNode[]>([]);

  // Filter state - changed to multi-select arrays
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [supportFilter, setSupportFilter] = useState<SupportFilter>('all');
  const [showOnlyOfftrack, setShowOnlyOfftrack] = useState(false);
  const [hideStubs, setHideStubs] = useState(false);
  const [selectedStakeholders, setSelectedStakeholders] = useState<string[]>([]);
  const [showTeams, setShowTeams] = useState(false);
  const [showInitiatives, setShowInitiatives] = useState(false);
  const [showMoney, setShowMoney] = useState(true);
  const effectiveShowMoney = canViewMoney && showMoney;
  const [highlightedInitiative, setHighlightedInitiative] = useState<string | null>(null);
  const [clickedNodeName, setClickedNodeName] = useState<string | null>(null);

  // Cost filter state (Timeline only)
  const [costSortOrder, setCostSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [costFilterMin, setCostFilterMin] = useState<number | null>(null);
  const [costFilterMax, setCostFilterMax] = useState<number | null>(null);
  const [costType, setCostType] = useState<'period' | 'total'>('period');

  // UI state
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showOfftrackModal, setShowOfftrackModal] = useState(false);
  const [initiativePeekPath, setInitiativePeekPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  // Track which nesting levels were auto-enabled (vs manually toggled by user)
  const autoEnabledRef = useRef({ teams: false, initiatives: false });
  
  // Track if quarters were already initialized
  const quartersInitializedRef = useRef(false);

  // Tree is "ready" only after rebuildTree has run for current rawData (avoids one-frame flash of "no initiatives" empty state)
  const [treeReady, setTreeReady] = useState(false);

  // Get unique units and teams
  const units = [...new Set(rawData.map(r => r.unit))].sort();
  const teams = [...new Set(rawData.filter(r => r.team).map(r => r.team))].sort();

  // Load data from database when available
  useEffect(() => {
    if (dbData && dbData.length > 0 && !isUsingCSV) {
      const result = convertFromDB(dbData);
      setRawData(result.rawData);
      setAvailableYears(result.availableYears);
      setAvailableQuarters(result.availableQuarters);
      setStakeholderCombinations(result.stakeholderCombinations);
      
      // Only set selectedQuarters on first load
      if (!quartersInitializedRef.current && result.availableQuarters.length > 0) {
        setSelectedQuarters([...result.availableQuarters]);
        quartersInitializedRef.current = true;
      }
      
      console.log('Данные загружены из базы:', result.rawData.length, 'инициатив');
    }
  }, [dbData, isUsingCSV]);

  // По клику на логотип: полный сброс к начальному состоянию стартовой страницы
  useEffect(() => {
    if (location.state?.reset !== true) return;
    setCurrentView('budget');
    setNavigationStack([]);
    setSelectedUnits([]);
    setSelectedTeams([]);
    setSupportFilter('all');
    setShowOnlyOfftrack(false);
    setHideStubs(false);
    setSelectedStakeholders([]);
    setShowTeams(false);
    setShowInitiatives(false);
    setShowMoney(true);
    setHighlightedInitiative(null);
    setClickedNodeName(null);
    setCostSortOrder('none');
    setCostFilterMin(null);
    setCostFilterMax(null);
    setCostType('period');
    setShowSearch(false);
    setShowShortcuts(false);
    setShowOfftrackModal(false);
    setInitiativePeekPath(null);
    setSearchQuery('');
    setZoomPath([]);
    setResetZoomTrigger(prev => prev + 1);
    autoEnabledRef.current = { teams: false, initiatives: false };
    navigate('.', { replace: true, state: {} });
  }, [location.state?.reset, navigate]);

  // Build tree whenever filters change
  const rebuildTree = useCallback(() => {
    if (rawData.length === 0) return;

    // For multi-select: if nothing selected, show all
    const unitFilter = selectedUnits.length === 1 ? selectedUnits[0] : '';
    const teamFilter = selectedTeams.length === 1 ? selectedTeams[0] : '';

    const options = {
      selectedQuarters,
      supportFilter,
      showOnlyOfftrack,
      hideStubs,
      selectedStakeholders,
      unitFilter,
      teamFilter,
      selectedUnits,
      selectedTeams,
      showTeams,
      showInitiatives
    };

    const tree = buildBudgetTree(rawData, options);
    const stakeholdersTree = buildStakeholdersTree(rawData, options);

    setPortfolioData(tree);
    setStakeholdersData(stakeholdersTree);
    setCurrentRoot(currentView === 'stakeholders' ? stakeholdersTree : tree);
    setNavigationStack([]);
  }, [rawData, selectedQuarters, supportFilter, showOnlyOfftrack, hideStubs, selectedStakeholders, selectedUnits, selectedTeams, currentView, showTeams, showInitiatives]);

  useEffect(() => {
    if (rawData.length === 0) {
      setTreeReady(false);
      return;
    }
    rebuildTree();
    setTreeReady(true);
  }, [rebuildTree, rawData.length]);

  // Auto-enable toggles when zooming into a node (called from TreemapContainer)
  const handleAutoEnableTeams = useCallback(() => {
    if (!showTeams) {
      setShowTeams(true);
      autoEnabledRef.current.teams = true;
    }
  }, [showTeams]);

  const handleAutoEnableInitiatives = useCallback(() => {
    if (!showInitiatives) {
      setShowInitiatives(true);
      autoEnabledRef.current.initiatives = true;
    }
  }, [showInitiatives]);

  // Auto-disable toggles when zooming out (only if they were auto-enabled)
  const handleAutoDisableTeams = useCallback(() => {
    if (autoEnabledRef.current.teams) {
      setShowTeams(false);
      autoEnabledRef.current.teams = false;
    }
  }, []);

  const handleAutoDisableInitiatives = useCallback(() => {
    if (autoEnabledRef.current.initiatives) {
      setShowInitiatives(false);
      autoEnabledRef.current.initiatives = false;
    }
  }, []);

  // Track current zoom path for breadcrumb display (does NOT affect filters/data)
  const [zoomPath, setZoomPath] = useState<string[]>([]);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);

  const handleFocusedPathChange = useCallback((path: string[]) => {
    setZoomPath(path);
  }, []);
  // Process CSV file - shared logic for upload and drag-drop (fallback mode)
  const processCSVFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Пожалуйста, загрузите файл в формате .csv');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);

      setRawData(result.rawData);
      setAvailableYears(result.availableYears);
      setAvailableQuarters(result.availableQuarters);
      setSelectedQuarters([...result.availableQuarters]);
      setStakeholderCombinations(result.stakeholderCombinations);
      setIsUsingCSV(true);
      quartersInitializedRef.current = true;

      toast.success('CSV загружен: ' + file.name + ' (режим просмотра)');
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  // CSV Upload handler (input element)
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processCSVFile(file);
    // Reset input so same file can be uploaded again
    event.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processCSVFile(file);
    }
  }, [processCSVFile]);

  // Navigation - drill down into a node
  const drillDown = (node: TreeNode) => {
    if (!node.children) return;
    
    // Auto-toggle based on what we're drilling into
    if (node.isUnit) {
      // Drilling into a unit - auto-enable Teams
      if (!showTeams) setShowTeams(true);
      // Set filter to this unit
      setSelectedUnits([node.name]);
    } else if (node.isTeam) {
      // Drilling into a team - auto-enable Initiatives
      if (!showInitiatives) setShowInitiatives(true);
      // Set filter to this team
      setSelectedTeams([node.name]);
    }
    
    setNavigationStack([...navigationStack, currentRoot]);
    setCurrentRoot(node);
  };

  // Navigate up - go back one level and clear corresponding filter
  const navigateUp = () => {
    if (navigationStack.length === 0) return;
    const newStack = [...navigationStack];
    const parent = newStack.pop()!;
    
    // Clear the filter of the level we're leaving
    if (currentRoot.isTeam) {
      setSelectedTeams([]);
    } else if (currentRoot.isUnit) {
      setSelectedUnits([]);
      setSelectedTeams([]);
    }
    
    setNavigationStack(newStack);
    setCurrentRoot(parent);
  };

  // Handle click on treemap node — no longer used for drill-down (treemap handles zoom internally)
  // Kept for potential external use but treemap no longer calls this for units/teams
  const handleNodeClick = (node: TreeNode) => {
    setClickedNodeName(node.name);
  };

  // Navigate up one level (for the up arrow button)
  const canNavigateBack = selectedTeams.length > 0 || 
                          selectedUnits.length > 0 || 
                          selectedStakeholders.length > 0;

  const handleNavigateBack = useCallback(() => {
    if (selectedTeams.length > 0) {
      // If teams are selected with a single unit, clear both at once
      // (this is the typical "drilled into unit" state)
      if (selectedUnits.length === 1) {
        setSelectedTeams([]);
        setSelectedUnits([]);
      } else {
        // Multiple units selected - just clear teams
        setSelectedTeams([]);
      }
    } else if (selectedUnits.length > 0) {
      // If unit is selected, clear it (go back to all units)
      setSelectedUnits([]);
    } else if (selectedStakeholders.length > 0) {
      // If stakeholder is selected, clear it (go back to all stakeholders)
      setSelectedStakeholders([]);
    }
    // Don't change toggle states when going back
  }, [selectedTeams.length, selectedUnits.length, selectedStakeholders.length]);

  // Reset all filters (smart reset: if no quarters selected, restore all)
  const resetFilters = useCallback(() => {
    setSelectedUnits([]);
    setSelectedTeams([]);
    setSelectedStakeholders([]);
    setSupportFilter('all');
    setShowOnlyOfftrack(false);
    setHideStubs(false);
    
    // Reset cost filters
    setCostSortOrder('none');
    setCostFilterMin(null);
    setCostFilterMax(null);
    
    // Если период пустой, восстанавливаем все кварталы
    if (selectedQuarters.length === 0) {
      setSelectedQuarters([...availableQuarters]);
    }
  }, [selectedQuarters.length, availableQuarters]);

  // Check if any filter is active
  const hasActiveFilters = selectedUnits.length > 0 || 
                           selectedTeams.length > 0 || 
                           selectedStakeholders.length > 0 ||
                           supportFilter !== 'all' || 
                           showOnlyOfftrack ||
                           hideStubs ||
                           costSortOrder !== 'none' ||
                           costFilterMin !== null ||
                           costFilterMax !== null;

  // View switching
  const handleViewChange = (view: ViewType) => {
    const from = currentView;
    setCurrentView(view);
    setNavigationStack([]);
    setCurrentRoot(portfolioData);
    setHighlightedInitiative(null);
    // Treemap zoom path is tab-specific (budget: unit-first; clusters: stakeholder-first).
    // Reuse would mislabel the stakeholder filter with the budget unit segment.
    setZoomPath([]);
    setResetZoomTrigger((prev) => prev + 1);
  };

  // Resolve initiative row from treemap path (Unit/Team/Initiative or Stakeholder/Unit/Team/Initiative)
  const initiativePeekRow = (() => {
    if (!initiativePeekPath || rawData.length === 0) return null;
    const parts = splitTreemapEncodedPath(initiativePeekPath);
    let unit = '';
    let team = '';
    let initiative = '';
    if (parts.length === 2) {
      // Budget: Unit/Initiative (no teams)
      unit = parts[0];
      initiative = parts[1];
    } else if (parts.length === 3 && currentView === 'budget') {
      // Budget: Unit/Team/Initiative
      const teamRaw = parts[1];
      unit = parts[0];
      team = teamRaw === 'Без команды' ? '' : teamRaw;
      initiative = parts[2];
    } else if (parts.length === 3 && currentView === 'stakeholders') {
      // Stakeholders: Stakeholder/Unit/Initiative (no teams)
      unit = parts[1];
      initiative = parts[2];
    } else if (parts.length >= 4) {
      // Stakeholders: Stakeholder/Unit/Team/Initiative
      const teamRaw = parts[2];
      unit = parts[1];
      team = teamRaw === 'Без команды' ? '' : teamRaw;
      initiative = parts[3];
    }
    if (!unit && !initiative) return null;
    return (
      rawData.find(
        (r) =>
          r.unit === unit &&
          r.initiative === initiative &&
          (team !== '' ? (r.team || 'Без команды') === (team || 'Без команды') : true)
      ) ?? null
    );
  })();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') {
          setShowSearch(false);
          setSearchQuery('');
        }
        return;
      }

      switch (e.key) {
        case '1': handleViewChange('budget'); break;
        case '2': handleViewChange('stakeholders'); break;
        case '3': handleViewChange('timeline'); break;
        case '/': e.preventDefault(); setShowSearch(true); break;
        case '?': setShowShortcuts(true); break;
        case 'r':
        case 'R':
          if (e.shiftKey && hasActiveFilters) {
            e.preventDefault();
            resetFilters();
          }
          break;
        case 'Escape':
          if (showSearch) {
            setShowSearch(false);
            setSearchQuery('');
          } else if (showShortcuts) {
            setShowShortcuts(false);
          } else if (showOfftrackModal) {
            setShowOfftrackModal(false);
          } else if (canNavigateBack) {
            handleNavigateBack();
          } else if (showTeams || showInitiatives) {
            // At top level, reset nesting toggles
            setShowTeams(false);
            setShowInitiatives(false);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, showShortcuts, showOfftrackModal, canNavigateBack, handleNavigateBack, hasActiveFilters, resetFilters, showTeams, showInitiatives]);

  // Search filtered results
  const searchResults = rawData.filter(row => {
    const q = searchQuery.toLowerCase();
    return row.initiative.toLowerCase().includes(q) ||
           row.unit.toLowerCase().includes(q) ||
           row.team.toLowerCase().includes(q);
  }).slice(0, 20);

  // Off-track items
  const offtrackItems = rawData.filter(row => {
    const budget = calculateBudget(row, selectedQuarters);
    return budget > 0 && isInitiativeOffTrack(row, selectedQuarters);
  });

  const showDataWarningBanner =
    SHOW_DASHBOARD_DATA_WARNING && (currentView === 'budget' || currentView === 'stakeholders');

  // Show loading state — не полноэкранный лоадер: shell уже ниже, в main покажем «Загрузка…»
  // (блок ниже удалён: return <MascotsLoadingScreen />)

  // Show error state (only when no successful data — avoid flash while rawData syncs from dbData)
  if (error && rawData.length === 0 && (!dbData || dbData.length === 0)) {
    return (
      <MascotMessageScreen
        title="Упс, не удалось загрузить данные"
        description={error.message}
        action={
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw size={16} />
            Попробовать снова
          </Button>
        }
      />
    );
  }

  // Empty state: user has access but no data in their scope (avoid flash while rawData syncs from dbData)
  if (canAccess && rawData.length === 0 && !isLoading && (!dbData || dbData.length === 0)) {
    return (
      <MascotMessageScreen
        title="Упс, по вашему доступу данных нет"
        description="Если считаете, что должны видеть часть портфеля, обратитесь к администратору."
      />
    );
  }

  return (
    <div 
      className="min-h-screen bg-background overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center pointer-events-none">
          <div className="bg-card border-3 border-dashed border-primary rounded-2xl px-16 py-12 flex flex-col items-center gap-4">
            <Upload size={48} className="text-primary" />
            <span className="text-xl font-medium text-primary">Отпустите файл для загрузки</span>
            <span className="text-sm text-muted-foreground">Поддерживаются файлы .csv</span>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCSVUpload}
      />

      {/* Header */}
      <Header
        currentView={currentView}
        onViewChange={handleViewChange}
        onSearchClick={() => setShowSearch(true)}
        isAdmin={isAdmin}
      />

      {/* Filter Bar - 2 rows now */}
      <FilterBar
        units={units}
        teams={teams}
        selectedUnits={selectedUnits}
        selectedTeams={selectedTeams}
        onUnitsChange={(units) => {
          setSelectedUnits(units);
          setZoomPath([]);
          setResetZoomTrigger(prev => prev + 1);
        }}
        onTeamsChange={(teams) => {
          setSelectedTeams(teams);
          setZoomPath([]);
          setResetZoomTrigger(prev => prev + 1);
        }}
        supportFilter={supportFilter}
        onSupportFilterChange={setSupportFilter}
        showOnlyOfftrack={showOnlyOfftrack}
        onShowOnlyOfftrackChange={setShowOnlyOfftrack}
        hideStubs={hideStubs}
        onHideStubsChange={setHideStubs}
        onStubClick={() => {
          setShowOnlyOfftrack(false);
          setHideStubs(prev => !prev);
        }}
        allStakeholders={stakeholderCombinations}
        selectedStakeholders={selectedStakeholders}
        onStakeholdersChange={(stakeholders) => {
          setSelectedStakeholders(stakeholders);
          setZoomPath([]);
          setResetZoomTrigger(prev => prev + 1);
        }}
        availableYears={availableYears}
        availableQuarters={availableQuarters}
        selectedQuarters={selectedQuarters}
        onQuartersChange={setSelectedQuarters}
        rawData={rawData}
        showTeams={showTeams}
        showInitiatives={showInitiatives}
        onShowTeamsChange={(v) => { setShowTeams(v); if (!v) autoEnabledRef.current.teams = false; else autoEnabledRef.current.teams = false; }}
        onShowInitiativesChange={(v) => { setShowInitiatives(v); if (!v) autoEnabledRef.current.initiatives = false; else autoEnabledRef.current.initiatives = false; }}
        canViewMoney={canViewMoney}
        showMoney={effectiveShowMoney}
        onShowMoneyChange={canViewMoney ? setShowMoney : () => {}}
        onOfftrackClick={() => {
          setHideStubs(false);
          setShowOnlyOfftrack(prev => !prev);
        }}
        hideNestingToggles={currentView === 'timeline'}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        // Cost filter props (Timeline only)
        costSortOrder={costSortOrder}
        onCostSortOrderChange={setCostSortOrder}
        costFilterMin={costFilterMin}
        costFilterMax={costFilterMax}
        onCostFilterChange={(min, max) => {
          setCostFilterMin(min);
          setCostFilterMax(max);
        }}
        costType={costType}
        onCostTypeChange={setCostType}
        zoomPath={currentView !== 'timeline' ? zoomPath : []}
        zoomActiveTab={currentView === 'stakeholders' ? 'stakeholders' : 'budget'}
        currentView={currentView}
      />

      {/* Main: хедер + FilterBar (~9.75rem) */}
      <main className="mt-[9.75rem] h-[calc(100vh-9.75rem)] overflow-hidden">
        {(() => {
          const showLoader =
            (rawData.length === 0 && (isLoading || (dbData && dbData.length > 0))) ||
            (rawData.length > 0 && !treeReady);
          const showContent = rawData.length > 0 && treeReady;

          return (
            <div className="relative h-full">
              {/* Loader layer — crossfade out when content is ready */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out"
                style={{
                  opacity: showLoader ? 1 : 0,
                  pointerEvents: showLoader ? 'auto' : 'none',
                }}
                aria-hidden={!showLoader}
              >
                <LogoLoader className="h-10 w-10" />
              </div>

              {/* Content layer — mounted when data exists, crossfade in when tree ready */}
              {rawData.length > 0 && (
                <div
                  className="absolute inset-0 transition-opacity duration-300 ease-out"
                  style={{
                    opacity: showContent ? 1 : 0,
                    pointerEvents: showContent ? 'auto' : 'none',
                  }}
                  aria-hidden={!showContent}
                >
        {showDataWarningBanner && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-30">
            <DashboardDataWarning />
          </div>
        )}

        {currentView === 'budget' && (
          <BudgetTreemap
            viewKey="budget"
            contentKey={`${supportFilter}-${showOnlyOfftrack}-${hideStubs}`}
            data={currentRoot}
            onDrillDown={drillDown}
            onNavigateUp={navigateUp}
            showBackButton={navigationStack.length > 0}
            showTeams={showTeams}
            showInitiatives={showInitiatives}
            onUploadClick={() => fileInputRef.current?.click()}
            selectedQuarters={selectedQuarters}
            onNavigateBack={handleNavigateBack}
            canNavigateBack={selectedUnits.length > 0 || selectedTeams.length > 0}
            onInitiativeClick={(name, path) => {
              setInitiativePeekPath(path);
            }}
            onFileDrop={processCSVFile}
            hasData={rawData.length > 0}
            onResetFilters={resetFilters}
            selectedUnitsCount={selectedUnits.length}
            clickedNodeName={clickedNodeName}
            onAutoEnableTeams={handleAutoEnableTeams}
            onAutoEnableInitiatives={handleAutoEnableInitiatives}
            onAutoDisableTeams={handleAutoDisableTeams}
            onAutoDisableInitiatives={handleAutoDisableInitiatives}
            onFocusedPathChange={handleFocusedPathChange}
            resetZoomTrigger={resetZoomTrigger}
            initialFocusedPath={zoomPath}
            showMoney={effectiveShowMoney}
          />
        )}

        {currentView === 'stakeholders' && (
          <StakeholdersTreemap
            viewKey="stakeholders"
            data={stakeholdersData}
            onNavigateBack={handleNavigateBack}
            canNavigateBack={selectedUnits.length > 0 || selectedTeams.length > 0 || selectedStakeholders.length > 0}
            selectedQuarters={selectedQuarters}
            hasData={rawData.length > 0}
            onInitiativeClick={(name, path) => {
              setInitiativePeekPath(path);
            }}
            onResetFilters={resetFilters}
            selectedUnitsCount={selectedUnits.length}
            clickedNodeName={clickedNodeName}
            onAutoEnableTeams={handleAutoEnableTeams}
            onAutoEnableInitiatives={handleAutoEnableInitiatives}
            onAutoDisableTeams={handleAutoDisableTeams}
            onAutoDisableInitiatives={handleAutoDisableInitiatives}
            onFocusedPathChange={handleFocusedPathChange}
            resetZoomTrigger={resetZoomTrigger}
            showTeams={showTeams}
            showInitiatives={showInitiatives}
            initialFocusedPath={zoomPath}
            showMoney={effectiveShowMoney}
          />
        )}

        {currentView === 'timeline' && (
          <GanttView
            rawData={rawData}
            selectedQuarters={selectedQuarters}
            supportFilter={supportFilter}
            showOnlyOfftrack={showOnlyOfftrack}
            hideStubs={hideStubs}
            selectedUnits={selectedUnits}
            selectedTeams={selectedTeams}
            selectedStakeholders={selectedStakeholders}
            onUploadClick={() => fileInputRef.current?.click()}
            highlightedInitiative={highlightedInitiative}
            onResetFilters={resetFilters}
            showMoney={effectiveShowMoney}
            costSortOrder={costSortOrder}
            costFilterMin={costFilterMin}
            costFilterMax={costFilterMax}
            costType={costType}
          />
        )}
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* Initiative peek modal (from treemap click) */}
      <InitiativePeekModal
        open={initiativePeekPath !== null}
        onOpenChange={(open) => !open && setInitiativePeekPath(null)}
        row={initiativePeekRow}
        selectedQuarters={selectedQuarters}
        showMoney={effectiveShowMoney}
        onGoToTimeline={(initiativeName) => {
          setHighlightedInitiative(initiativeName);
          setCurrentView('timeline');
          setInitiativePeekPath(null);
        }}
      />

      {/* Search Overlay */}
      {showSearch && (
        <div
          className="fixed inset-0 bg-black/50 z-[300] pt-24 flex justify-center"
          onClick={() => { setShowSearch(false); setSearchQuery(''); }}
        >
          <div
            className="w-[500px] max-w-[90vw] max-h-[500px] bg-card rounded-lg shadow-lg flex flex-col animate-in fade-in slide-in-from-top-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center p-4 border-b border-border">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground mr-3">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск инициатив..."
                className="flex-1 border-none outline-none text-base bg-transparent"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {searchQuery ? 'Ничего не найдено' : 'Начните вводить для поиска'}
                </div>
              ) : (
                searchResults.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary"
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                      setHighlightedInitiative(row.initiative);
                      setCurrentView('timeline');
                    }}
                  >
                    <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {row.initiative.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{row.initiative}</div>
                      <div className="text-xs text-muted-foreground">{row.unit} › {row.team}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-[400px] max-w-[90vw] bg-card rounded-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border text-base font-semibold">
              Горячие клавиши
            </div>
            <div className="p-4 space-y-2">
              {[
                ['Вкладка Бюджет', '1'],
                ['Вкладка Кластеры', '2'],
                ['Вкладка Таймлайн', '3'],
                ['Поиск', '/'],
                ['Сбросить фильтры', 'Shift+R'],
                ['Наверх / Закрыть', 'Esc']
              ].map(([label, key]) => (
                <div key={label} className="flex justify-between items-center py-2">
                  <span className="text-sm">{label}</span>
                  <kbd className="px-2 py-1 bg-secondary border border-border rounded text-xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Off-track Modal */}
      {showOfftrackModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center"
          onClick={() => setShowOfftrackModal(false)}
        >
          <div
            className="w-[600px] max-w-[90vw] max-h-[80vh] bg-card rounded-lg shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 bg-destructive/10 rounded-md flex items-center justify-center">
                <div style={{ borderStyle: 'solid', borderWidth: '0 12px 12px 0', borderColor: 'transparent hsl(var(--destructive)) transparent transparent' }} />
              </div>
              <span className="text-base font-semibold flex-1">Инициативы Off-Track</span>
              <button
                onClick={() => setShowOfftrackModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {offtrackItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Нет инициатив со статусом Off-Track
                </div>
              ) : (
                offtrackItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-border rounded-lg cursor-pointer hover:bg-secondary hover:border-destructive transition-colors"
                    onClick={() => {
                      setShowOfftrackModal(false);
                      setShowOnlyOfftrack(true);
                      handleViewChange('timeline');
                    }}
                  >
                    <div className="font-medium mb-1">{item.initiative}</div>
                    <div className="text-xs text-muted-foreground mb-2">{item.unit} › {item.team}</div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Бюджет: {formatBudget(calculateBudget(item, selectedQuarters))}</span>
                      <span>Стейкхолдеры: {item.stakeholders || '-'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;