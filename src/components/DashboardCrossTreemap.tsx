import { useCallback, useEffect, useMemo, useState } from 'react';
import StaticTreemapContainer from '@/components/treemap/StaticTreemapContainer';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';
import {
  buildDashboardCrossOnlyTree,
  buildDashboardCrossPortfolioTree,
  PORTFOLIO_REST_NODE_NAME,
} from '@/lib/dashboardCrossTreemapTree';
import {
  applyCrossOverviewView,
  crossOverviewRenderDepth,
  type CrossOverviewVisibility,
} from '@/lib/crossOverviewTreeView';
import { resolveDashboardCrossSplitVisibility } from '@/lib/dashboardCrossTreemapVisibility';
import { balanceCrossOverviewTreemapValues } from '@/lib/crossOverviewTreemapBalance';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { BuildTreeOptions, RawDataRow, TreeNode } from '@/lib/dataManager';
import { createCrossOverviewColorGetter } from '@/lib/crossTreemapColors';
import {
  crossNamesForInitiative,
  membersForCross,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import type { UnificationBudgetContext } from '@/lib/unificationBudget';
import { findTreeNodeByPath } from '@/lib/treemapD3Layout';
import { LogoLoader } from '@/components/LogoLoader';

interface DashboardCrossTreemapProps {
  rawData: RawDataRow[];
  bundle: CrossInitiativesBundle | undefined;
  initiativeById: Map<string, AdminDataRow>;
  buildOptions: BuildTreeOptions;
  budgetCtx: UnificationBudgetContext;
  selectedQuarters: string[];
  showMoney: boolean;
  isLoading: boolean;
  selectedUnits: string[];
  /** «Остальное»: инициативы портфеля, не входящие в кросс-инициативы */
  showPortfolioRest: boolean;
  showCrossesForSelectedUnit: boolean;
  crossLevelVisibility: CrossOverviewVisibility;
  /** Раскрывать инициативы внутри плиток кросс-инициатив (отдельно от «Остальное»). */
  showInitiativesInsideCrosses: boolean;
  showTeams: boolean;
  showInitiatives: boolean;
  onAutoEnableUnits: () => void;
  onAutoEnableTeams: () => void;
  onAutoEnableInitiatives: () => void;
  onAutoDisableUnits: () => void;
  onAutoDisableTeams: () => void;
  onAutoDisableInitiatives: () => void;
  onLevelStateReset: () => void;
  onInitiativeClick: (initiativeName: string, path: string) => void;
  contentKey: string;
  resetZoomTrigger: number;
}

function reshapeCrossNode(cross: TreeNode, visibility: CrossOverviewVisibility): TreeNode {
  const wrapped = applyCrossOverviewView(
    { name: 'Кросс-инициативы', isRoot: true, children: [cross] },
    visibility
  );
  return wrapped.children?.[0] ?? cross;
}

function reshapePortfolioRestNode(rest: TreeNode, visibility: CrossOverviewVisibility): TreeNode {
  const wrapped = applyCrossOverviewView(
    { name: 'Портфель', isRoot: true, children: [rest] },
    visibility
  );
  return wrapped.children?.[0] ?? rest;
}

function buildDisplayTree(
  portfolioTree: TreeNode,
  focusedPath: string[],
  showPortfolioRest: boolean,
  levels: CrossOverviewVisibility,
  showInitiativesInsideCrosses: boolean
): TreeNode {
  const { cross: crossVisibility, rest: restVisibility } = resolveDashboardCrossSplitVisibility(
    showPortfolioRest,
    focusedPath,
    portfolioTree,
    levels,
    showInitiativesInsideCrosses
  );

  if (!showPortfolioRest) {
    return applyCrossOverviewView(portfolioTree, crossVisibility);
  }

  const focusedName = focusedPath[0];
  if (!focusedName || focusedPath.length === 0) {
    const children = (portfolioTree.children ?? []).map((child) => {
      if (child.isCrossInitiative) {
        return applyCrossOverviewView(
          { name: 'tmp', isRoot: true, children: [child] },
          crossVisibility
        ).children?.[0] ?? child;
      }
      if (child.isPortfolioRest) {
        return reshapePortfolioRestNode(child, restVisibility);
      }
      return child;
    });
    return { ...portfolioTree, children, value: portfolioTree.value };
  }

  const focusedChild = (portfolioTree.children ?? []).find((c) => c.name === focusedName);

  if (focusedChild?.isCrossInitiative) {
    const reshaped = reshapeCrossNode(focusedChild, crossVisibility);
    return {
      ...portfolioTree,
      children: (portfolioTree.children ?? []).map((c) =>
        c.name === focusedName ? reshaped : c
      ),
    };
  }

  if (focusedChild?.isPortfolioRest) {
    const reshaped = reshapePortfolioRestNode(focusedChild, restVisibility);
    return {
      ...portfolioTree,
      children: (portfolioTree.children ?? []).map((c) =>
        c.name === focusedName ? reshaped : c
      ),
    };
  }

  return portfolioTree;
}

export function DashboardCrossTreemap({
  rawData,
  bundle,
  initiativeById,
  buildOptions,
  budgetCtx,
  selectedQuarters,
  showMoney,
  isLoading,
  selectedUnits,
  showPortfolioRest,
  showCrossesForSelectedUnit,
  crossLevelVisibility,
  showInitiativesInsideCrosses,
  showTeams,
  showInitiatives,
  onAutoEnableUnits,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableUnits,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onLevelStateReset,
  onInitiativeClick,
  contentKey,
  resetZoomTrigger,
}: DashboardCrossTreemapProps) {
  const [focusedPath, setFocusedPath] = useState<string[]>([]);

  useEffect(() => {
    setFocusedPath([]);
  }, [showPortfolioRest, resetZoomTrigger]);

  const selectedUnitFilter = selectedUnits.length === 1 ? selectedUnits[0] : undefined;

  const crossNames = useMemo(
    () => (bundle?.crossInitiatives ?? []).map((c) => c.name),
    [bundle?.crossInitiatives]
  );

  const treemapGetColor = useMemo(
    () => createCrossOverviewColorGetter(crossNames, PORTFOLIO_REST_NODE_NAME),
    [crossNames]
  );

  const portfolioTree = useMemo(() => {
    if (!bundle?.crossInitiatives.length) return null;

    const built = showPortfolioRest
      ? buildDashboardCrossPortfolioTree({
          rawData,
          bundle,
          initiativeById,
          buildOptions,
          budgetCtx,
          includePortfolioRest: true,
          selectedUnitFilter,
          showCrossesForSelectedUnit,
        })
      : buildDashboardCrossOnlyTree(
          bundle,
          initiativeById,
          buildOptions.selectedQuarters,
          budgetCtx,
          rawData,
          buildOptions
        );

    const normalized = prepareStaticTreemapTree(built);
    return balanceCrossOverviewTreemapValues(normalized);
  }, [
    rawData,
    bundle,
    initiativeById,
    buildOptions,
    budgetCtx,
    showPortfolioRest,
    selectedUnitFilter,
    showCrossesForSelectedUnit,
  ]);

  const displayTree = useMemo(() => {
    if (!portfolioTree) return null;
    const tree = buildDisplayTree(
      portfolioTree,
      focusedPath,
      showPortfolioRest,
      crossLevelVisibility,
      showInitiativesInsideCrosses
    );
    return prepareStaticTreemapTree(tree);
  }, [
    portfolioTree,
    focusedPath,
    showPortfolioRest,
    crossLevelVisibility,
    showInitiativesInsideCrosses,
  ]);

  const maxRenderDepth = useMemo(
    () => (displayTree ? crossOverviewRenderDepth(displayTree, focusedPath) : 3),
    [displayTree, focusedPath]
  );

  const effectiveCrossInitiativesVisible = useMemo(() => {
    const { cross } = resolveDashboardCrossSplitVisibility(
      showPortfolioRest,
      focusedPath,
      portfolioTree ?? { name: '', children: [] },
      crossLevelVisibility,
      showInitiativesInsideCrosses
    );
    return cross.showInitiatives;
  }, [
    showPortfolioRest,
    focusedPath,
    portfolioTree,
    crossLevelVisibility,
    showInitiativesInsideCrosses,
  ]);

  const getInitiativeCrossNames = useCallback(
    (initiativeId: string) => crossNamesForInitiative(initiativeId, bundle),
    [bundle]
  );

  const getCrossInitiativeTooltipMembers = useCallback(
    (crossId: string) => {
      const list = membersForCross(crossId, bundle?.members ?? []);
      return list
        .map((m) => {
          const row = initiativeById.get(m.initiative_id);
          return {
            initiativeName: row?.initiative ?? m.initiative_name ?? '—',
            team: m.team || row?.team || '',
          };
        })
        .sort((a, b) => a.initiativeName.localeCompare(b.initiativeName, 'ru'));
    },
    [bundle?.members, initiativeById]
  );

  const handleFocusedPathChange = useCallback(
    (path: string[]) => {
      setFocusedPath(path);
      if (path.length === 0) {
        onLevelStateReset();
        return;
      }

      const focusedNode =
        portfolioTree && path.length > 0 ? findTreeNodeByPath(portfolioTree, path) : null;

      if (focusedNode?.isPortfolioRest) {
        if (path.length === 1) onAutoEnableUnits();
        else if (path.length === 2) onAutoEnableTeams();
        else if (path.length >= 3) onAutoEnableInitiatives();
        return;
      }

      if (path.length === 1) onAutoEnableUnits();
      else if (path.length === 2) onAutoEnableTeams();
      else if (path.length >= 3) onAutoEnableInitiatives();
    },
    [
      portfolioTree,
      onLevelStateReset,
      onAutoEnableUnits,
      onAutoEnableTeams,
      onAutoEnableInitiatives,
    ]
  );

  const viewKey = [
    contentKey,
    resetZoomTrigger,
    focusedPath.join('/'),
    showPortfolioRest ? 'rest:1' : 'rest:0',
    showInitiativesInsideCrosses ? 'crossIni:1' : 'crossIni:0',
    `u${crossLevelVisibility.showUnits}`,
    `t${showTeams}`,
    `i${showInitiatives}`,
  ].join('|');

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <LogoLoader className="h-10 w-10" />
      </div>
    );
  }

  if (!bundle?.crossInitiatives.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-2">
        <p className="text-muted-foreground max-w-md">
          Пока нет кросс-инициатив. Связи создаются в разделе «Кросс-инициатива» в админке.
        </p>
      </div>
    );
  }

  const hasVisibleTiles = (displayTree?.children?.length ?? 0) > 0;
  if (!displayTree || !hasVisibleTiles) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-2">
        <p className="text-muted-foreground max-w-md">
          Нет кросс-инициатив по текущим фильтрам. Смените юнит, команду или сбросьте фильтры.
        </p>
      </div>
    );
  }

  return (
    <StaticTreemapContainer
      data={displayTree}
      hasData
      selectedQuarters={selectedQuarters}
      showMoney={showMoney}
      showDistributionInTooltip={showMoney}
      getColor={treemapGetColor}
      treemapLayoutStrategy="d3-root"
      maxRenderDepth={maxRenderDepth}
      showTeams={crossLevelVisibility.showTeams}
      showInitiatives={effectiveCrossInitiativesVisible}
      disableAutoEnableLevels
      focusedPath={focusedPath}
      onFocusedPathChange={handleFocusedPathChange}
      onInitiativeClick={onInitiativeClick}
      onAutoEnableUnits={onAutoEnableUnits}
      onAutoEnableTeams={onAutoEnableTeams}
      onAutoEnableInitiatives={onAutoEnableInitiatives}
      onAutoDisableUnits={onAutoDisableUnits}
      onAutoDisableTeams={onAutoDisableTeams}
      onAutoDisableInitiatives={onAutoDisableInitiatives}
      emptyStateTitle="Нет данных для кросс-инициатив"
      emptyStateShowResetButton={false}
      resetZoomTrigger={resetZoomTrigger}
      contentKey={viewKey}
      viewKey="crossInitiatives"
      nodeCursor="pointer"
      getInitiativeCrossNames={getInitiativeCrossNames}
      getCrossInitiativeTooltipMembers={getCrossInitiativeTooltipMembers}
    />
  );
}
