import type { CrossOverviewVisibility } from '@/lib/crossOverviewTreeView';
import { PORTFOLIO_REST_NODE_NAME } from '@/lib/dashboardCrossTreemapTree';
import type { TreeNode } from '@/lib/dataManager';

export type DashboardCrossSplitVisibility = {
  cross: CrossOverviewVisibility;
  rest: CrossOverviewVisibility;
};

/** Раздельная видимость уровней: слева «Остальное», справа кросс-инициативы. */
function visibilityInsideCrossDrill(
  levels: CrossOverviewVisibility,
  showInitiativesInsideCrosses: boolean,
  focusedPath: string[]
): CrossOverviewVisibility {
  const depth = focusedPath.length;
  return {
    showUnits: levels.showUnits || depth >= 1,
    showTeams: levels.showTeams || depth >= 2,
    showInitiatives:
      levels.showInitiatives ||
      showInitiativesInsideCrosses ||
      depth >= 3 ||
      (depth >= 2 && !levels.showTeams),
  };
}

export function resolveDashboardCrossSplitVisibility(
  showPortfolioRest: boolean,
  focusedPath: string[],
  portfolioTree: TreeNode,
  levels: CrossOverviewVisibility,
  showInitiativesInsideCrosses: boolean
): DashboardCrossSplitVisibility {
  const rest: CrossOverviewVisibility = {
    showUnits: true,
    showTeams: levels.showTeams,
    showInitiatives: levels.showInitiatives,
  };

  const focusedName = focusedPath[0];
  const focusedChild = focusedName
    ? portfolioTree.children?.find((c) => c.name === focusedName)
    : undefined;

  const insideCross = Boolean(focusedChild?.isCrossInitiative && focusedPath.length > 0);

  if (insideCross) {
    return {
      cross: visibilityInsideCrossDrill(levels, showInitiativesInsideCrosses, focusedPath),
      rest,
    };
  }

  const crossAtSplitView: CrossOverviewVisibility = {
    showUnits: levels.showUnits,
    showTeams: levels.showTeams,
    showInitiatives: showInitiativesInsideCrosses,
  };

  if (!showPortfolioRest) {
    return { cross: crossAtSplitView, rest };
  }

  if (focusedChild?.isPortfolioRest || focusedName === PORTFOLIO_REST_NODE_NAME) {
    return { cross: crossAtSplitView, rest };
  }

  return { cross: crossAtSplitView, rest };
}
