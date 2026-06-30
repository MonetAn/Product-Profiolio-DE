import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmbedToolbar } from '@/components/EmbedToolbar';
import BudgetTreemap from '@/components/BudgetTreemap';
import GanttView from '@/components/GanttView';
import { InitiativePeekModal } from '@/components/InitiativePeekModal';
import { LogoLoader } from '@/components/LogoLoader';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';
import { usePublicEmbedPortfolio } from '@/hooks/usePublicEmbedPortfolio';
import {
  buildBudgetTree,
  convertFromDB,
  RawDataRow,
  TreeNode,
  resolveInitiativeRowFromTreemapPath,
  type BudgetDepartmentAllocation,
} from '@/lib/dataManager';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';
import { filterQuarters2026 } from '@/lib/budgetTruth2026';
import type { EmbedView } from '@/lib/publicEmbed';
import {
  filtersToBudgetTreemapPath,
  treemapPathToBudgetFilters,
} from '@/lib/treemapFilterSync';

function sortedJoin(values: string[]): string {
  return [...values].sort().join(',');
}

export default function EmbedPortfolio() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error, refetch } = usePublicEmbedPortfolio(slug);

  const [currentView, setCurrentView] = useState<EmbedView>('budget');
  const [showTeams, setShowTeams] = useState(true);
  const [showInitiatives, setShowInitiatives] = useState(false);
  const [rawData, setRawData] = useState<RawDataRow[]>([]);
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [portfolioData, setPortfolioData] = useState<TreeNode>({ name: 'Unit', children: [], isRoot: true });
  const [currentRoot, setCurrentRoot] = useState<TreeNode>({ name: 'Unit', children: [], isRoot: true });
  const [navigationStack, setNavigationStack] = useState<TreeNode[]>([]);
  const [treeReady, setTreeReady] = useState(false);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);
  const [clickedNodeName, setClickedNodeName] = useState<string | null>(null);
  const [initiativePeekTarget, setInitiativePeekTarget] = useState<{ path: string; rowId?: string } | null>(null);
  const [highlightedInitiative, setHighlightedInitiative] = useState<string | null>(null);
  const autoEnabledRef = useRef({ teams: false, initiatives: false });
  const quartersInitializedRef = useRef(false);

  const unit = data?.unit ?? '';
  const selectedUnits = unit ? [unit] : [];
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const baselineByTeam = data?.baselineByTeam;

  const budgetAllocationsByInitiativeId = useMemo(() => {
    const grouped: Record<string, BudgetDepartmentAllocation[]> = {};
    (data?.budgetDepartmentAllocations ?? []).forEach((allocation) => {
      if (!grouped[allocation.initiativeId]) grouped[allocation.initiativeId] = [];
      grouped[allocation.initiativeId]!.push({
        budgetDepartment: allocation.budgetDepartment,
        isInPnlIt: allocation.isInPnlIt,
        quarterlyBudget: allocation.quarterlyBudget,
      });
    });
    return grouped;
  }, [data?.budgetDepartmentAllocations]);

  useEffect(() => {
    if (!data?.initiatives?.length) {
      setRawData([]);
      return;
    }
    const result = convertFromDB(data.initiatives, budgetAllocationsByInitiativeId);
    setRawData(result.rawData);
    setAvailableQuarters(result.availableQuarters);
    if (!quartersInitializedRef.current && result.availableQuarters.length > 0) {
      const q2026 = filterQuarters2026(result.availableQuarters);
      setSelectedQuarters(q2026.length > 0 ? q2026 : [...result.availableQuarters]);
      quartersInitializedRef.current = true;
    }
  }, [data, budgetAllocationsByInitiativeId]);

  const rebuildTree = useCallback(() => {
    if (rawData.length === 0 || !unit) {
      const empty: TreeNode = { name: unit || 'Unit', children: [], isRoot: true };
      setPortfolioData(empty);
      setCurrentRoot(empty);
      setNavigationStack([]);
      return;
    }

    const unitFilter = unit;
    const teamFilter = selectedTeams.length === 1 ? selectedTeams[0] : '';

    const options = {
      selectedQuarters,
      supportFilter: 'all' as const,
      showOnlyOfftrack: false,
      hideStubs: false,
      selectedStakeholders: [] as string[],
      unitFilter,
      teamFilter,
      selectedUnits,
      selectedTeams,
      showTeams,
      showInitiatives,
      includeNonPnlBudgets: false,
      includePreliminaryData: false,
      preliminaryQuarterBudgetMap: undefined,
      baselineByTeam,
    };

    const tree = buildBudgetTree(rawData, options);
    setPortfolioData(tree);
    setCurrentRoot(tree);
    setNavigationStack([]);
  }, [
    rawData,
    unit,
    selectedQuarters,
    selectedUnits,
    selectedTeams,
    showTeams,
    showInitiatives,
    baselineByTeam,
  ]);

  useEffect(() => {
    rebuildTree();
    setTreeReady(true);
  }, [rebuildTree, rawData.length]);

  const staticBudgetTreeData = useMemo(
    () => prepareStaticTreemapTree(portfolioData),
    [portfolioData]
  );

  const treemapFocusedPath = useMemo(
    () => filtersToBudgetTreemapPath(selectedUnits, selectedTeams),
    [selectedUnits, selectedTeams]
  );

  const handleFocusedPathChange = useCallback(
    (path: string[]) => {
      const next = treemapPathToBudgetFilters(path);
      if (next.units !== undefined) {
        // unit fixed in embed — ignore unit changes from treemap
      }
      if (next.teams !== undefined) setSelectedTeams(next.teams);
    },
    []
  );

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

  const handleNavigateBack = useCallback(() => {
    if (selectedTeams.length > 0) {
      setSelectedTeams([]);
    }
  }, [selectedTeams.length]);

  const drillDown = (node: TreeNode) => {
    if (!node.children) return;
    if (node.isTeam && !showInitiatives) setShowInitiatives(true);
    if (node.isTeam) setSelectedTeams([node.name]);
    setNavigationStack([...navigationStack, currentRoot]);
    setCurrentRoot(node);
  };

  const navigateUp = () => {
    if (navigationStack.length === 0) return;
    const newStack = [...navigationStack];
    const parent = newStack.pop()!;
    if (currentRoot.isTeam) setSelectedTeams([]);
    setNavigationStack(newStack);
    setCurrentRoot(parent);
  };

  const budgetTreemapContentKey = useMemo(
    () =>
      [
        'embed-budget',
        showTeams ? 'teams:1' : 'teams:0',
        showInitiatives ? 'initiatives:1' : 'initiatives:0',
        `unit:${unit}`,
        `teamsSel:${sortedJoin(selectedTeams)}`,
        `quarters:${sortedJoin(selectedQuarters)}`,
      ].join('|'),
    [showTeams, showInitiatives, unit, selectedTeams, selectedQuarters]
  );

  const initiativePeekRow = useMemo(() => {
    if (!initiativePeekTarget || rawData.length === 0) return null;
    return resolveInitiativeRowFromTreemapPath(initiativePeekTarget.path, rawData, {
      currentView: 'budget',
      rowId: initiativePeekTarget.rowId,
      unitHint: unit || null,
      teamHint: selectedTeams.length === 1 ? selectedTeams[0] : null,
    });
  }, [initiativePeekTarget, rawData, unit, selectedTeams]);

  if (!slug) {
    return (
      <MascotMessageScreen
        title="Не указан embed-slug"
        description="Откройте ссылку вида /embed/tech-platform или /embed/b2b-pizza"
      />
    );
  }

  if (error && !data) {
    return (
      <MascotMessageScreen
        title="Не удалось загрузить данные"
        description={error.message}
        action={
          <Button variant="outline" onClick={() => void refetch()} className="gap-2">
            <RefreshCw size={16} />
            Попробовать снова
          </Button>
        }
      />
    );
  }

  if (!isLoading && data === null) {
    return (
      <MascotMessageScreen
        title="Ссылка не найдена"
        description={`Embed «${slug}» не существует или отключён.`}
      />
    );
  }

  const showLoader =
    isLoading ||
    (rawData.length === 0 && Boolean(data?.initiatives?.length)) ||
    (rawData.length > 0 && !treeReady);
  const showContent = rawData.length > 0 && treeReady && !isLoading;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <EmbedToolbar
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          setResetZoomTrigger((prev) => prev + 1);
        }}
        showTeams={showTeams}
        showInitiatives={showInitiatives}
        onShowTeamsChange={(v) => {
          setShowTeams(v);
          if (!v) autoEnabledRef.current.teams = false;
          setResetZoomTrigger((prev) => prev + 1);
        }}
        onShowInitiativesChange={(v) => {
          setShowInitiatives(v);
          if (!v) autoEnabledRef.current.initiatives = false;
          setResetZoomTrigger((prev) => prev + 1);
        }}
        rawData={rawData}
        selectedQuarters={selectedQuarters}
        selectedUnit={unit}
        baselineByTeam={baselineByTeam}
      />

      <main className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
          style={{ opacity: showLoader ? 1 : 0, pointerEvents: showLoader ? 'auto' : 'none' }}
          aria-hidden={!showLoader}
        >
          <LogoLoader className="h-10 w-10" />
        </div>

        {rawData.length > 0 && (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ opacity: showContent ? 1 : 0, pointerEvents: showContent ? 'auto' : 'none' }}
          >
            {currentView === 'budget' && (
              <BudgetTreemap
                viewKey="budget"
                contentKey={budgetTreemapContentKey}
                data={staticBudgetTreeData}
                onDrillDown={drillDown}
                onNavigateUp={navigateUp}
                showBackButton={navigationStack.length > 0}
                showTeams={showTeams}
                showInitiatives={showInitiatives}
                onUploadClick={() => {}}
                selectedQuarters={selectedQuarters}
                onNavigateBack={handleNavigateBack}
                canNavigateBack={selectedTeams.length > 0}
                onInitiativeClick={(_name, path, rowId) => setInitiativePeekTarget({ path, rowId })}
                onFileDrop={() => {}}
                hasData={rawData.length > 0}
                onResetFilters={() => setSelectedTeams([])}
                selectedUnitsCount={1}
                clickedNodeName={clickedNodeName}
                onAutoEnableTeams={handleAutoEnableTeams}
                onAutoEnableInitiatives={handleAutoEnableInitiatives}
                onAutoDisableTeams={handleAutoDisableTeams}
                onAutoDisableInitiatives={handleAutoDisableInitiatives}
                onFocusedPathChange={handleFocusedPathChange}
                resetZoomTrigger={resetZoomTrigger}
                initialFocusedPath={treemapFocusedPath}
                showMoney
                showInitiativePayback={false}
                showPreliminaryWarnings={false}
                useStaticLayout
              />
            )}

            {currentView === 'timeline' && (
              <GanttView
                rawData={rawData}
                selectedQuarters={selectedQuarters}
                supportFilter="all"
                showOnlyOfftrack={false}
                hideStubs={false}
                selectedUnits={selectedUnits}
                selectedTeams={selectedTeams}
                selectedStakeholders={[]}
                onUploadClick={() => {}}
                highlightedInitiative={highlightedInitiative}
                onResetFilters={() => setSelectedTeams([])}
                showMoney
                showInitiativePayback={false}
                includePreliminaryData={false}
                costSortOrder="none"
                costFilterMin={null}
                costFilterMax={null}
                costType="period"
              />
            )}
          </div>
        )}
      </main>

      <InitiativePeekModal
        open={initiativePeekTarget !== null}
        onOpenChange={(open) => !open && setInitiativePeekTarget(null)}
        row={initiativePeekRow}
        selectedQuarters={selectedQuarters}
        showMoney
        showInitiativePayback={false}
        includePreliminaryData={false}
        includeNonPnlBudgets={false}
        baselineByTeam={baselineByTeam}
        onGoToTimeline={(initiativeName) => {
          setHighlightedInitiative(initiativeName);
          setCurrentView('timeline');
          setInitiativePeekTarget(null);
        }}
      />
    </div>
  );
}
