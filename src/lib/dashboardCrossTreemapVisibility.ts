import type { CrossOverviewVisibility } from '@/lib/crossOverviewTreeView';
import { PORTFOLIO_REST_NODE_NAME } from '@/lib/dashboardCrossTreemapTree';
import type { TreeNode } from '@/lib/dataManager';

export type DashboardCrossSplitVisibility = {
  cross: CrossOverviewVisibility;
  rest: CrossOverviewVisibility;
};

/** Раздельная видимость уровней: слева «Остальное», справа кросс-инициативы. */
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

  if (!showPortfolioRest) {
    return {
      cross: {
        showUnits: levels.showUnits,
        showTeams: levels.showTeams,
        showInitiatives: showInitiativesInsideCrosses,
      },
      rest,
    };
  }

  const focusedName = focusedPath[0];
  const focusedChild = focusedName
    ? portfolioTree.children?.find((c) => c.name === focusedName)
    : undefined;

  const crossAtSplitView: CrossOverviewVisibility = {
    showUnits: levels.showUnits,
    showTeams: levels.showTeams,
    showInitiatives: showInitiativesInsideCrosses,
  };

  if (focusedChild?.isCrossInitiative) {
    return { cross: levels, rest };
  }

  if (focusedChild?.isPortfolioRest || focusedName === PORTFOLIO_REST_NODE_NAME) {
    return { cross: crossAtSplitView, rest };
  }

  return { cross: crossAtSplitView, rest };
}
