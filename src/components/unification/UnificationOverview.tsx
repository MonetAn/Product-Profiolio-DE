import { useCallback, useMemo, useState } from 'react';
import StaticTreemapContainer from '@/components/treemap/StaticTreemapContainer';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';
import { buildCrossInitiativeOverviewTree } from '@/lib/crossInitiativeOverviewTree';
import { balanceCrossOverviewTreemapValues } from '@/lib/crossOverviewTreemapBalance';
import {
  applyCrossOverviewView,
  crossOverviewRenderDepth,
} from '@/lib/crossOverviewTreeView';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  crossMemberMatchesScope,
  crossScopeFilterActive,
} from '@/lib/crossMemberScopeFilter';
import {
  crossNamesForInitiative,
  membersForCross,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import { createCrossOverviewColorGetter } from '@/lib/crossTreemapColors';
import type { UnificationBudgetContext } from '@/lib/unificationBudget';
import type { CrossOverviewLevelState } from '@/components/unification/CrossOverviewLevelToggles';
import { CrossInitiativePanel } from '@/components/unification/CrossInitiativePanel';
import { InitiativeUnificationPanel } from '@/components/unification/InitiativeUnificationPanel';
import { LogoLoader } from '@/components/LogoLoader';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

function crossIdFromFocusedPath(
  path: string[],
  bundle: CrossInitiativesBundle | undefined
): string | null {
  if (!bundle || path.length === 0) return null;
  const name = path[0];
  return bundle.crossInitiatives.find((c) => c.name === name)?.id ?? null;
}

interface UnificationOverviewProps {
  bundle: CrossInitiativesBundle | undefined;
  allInitiatives: AdminDataRow[];
  initiativeById: Map<string, AdminDataRow>;
  selectedQuarters: string[];
  budgetPeriodLabel?: string;
  showMoney: boolean;
  isLoading: boolean;
  budgetCtx: UnificationBudgetContext;
  filterUnits: string[];
  filterTeams: string[];
  levelState: CrossOverviewLevelState;
  onLevelStateReset: () => void;
  onFocusedPathLengthChange: (length: number) => void;
  onAutoEnableUnits: () => void;
  onAutoEnableTeams: () => void;
  onAutoEnableInitiatives: () => void;
  onAutoDisableUnits: () => void;
  onAutoDisableTeams: () => void;
  onAutoDisableInitiatives: () => void;
  onSwitchToLink: () => void;
  onAddToCross: (crossId: string, initiativeId: string) => Promise<void>;
  onRemoveFromCross: (crossId: string, initiativeId: string) => void;
  onSaveShares: (updates: { id: string; cost_share_pct: number }[]) => Promise<void>;
  onSaveCrossName: (crossId: string, name: string) => Promise<void>;
  onSaveCrossDescription: (crossId: string, description: string) => Promise<void>;
  removing?: boolean;
  addingToCross?: boolean;
  savingShares?: boolean;
  savingCrossName?: boolean;
  savingCrossDescription?: boolean;
}

export function UnificationOverview({
  bundle,
  allInitiatives,
  initiativeById,
  selectedQuarters,
  budgetPeriodLabel,
  showMoney,
  isLoading,
  budgetCtx,
  filterUnits,
  filterTeams,
  levelState,
  onLevelStateReset,
  onFocusedPathLengthChange,
  onAutoEnableUnits,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableUnits,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onSwitchToLink,
  onAddToCross,
  onRemoveFromCross,
  onSaveShares,
  onSaveCrossName,
  onSaveCrossDescription,
  removing,
  addingToCross,
  savingShares,
  savingCrossName,
  savingCrossDescription,
}: UnificationOverviewProps) {
  const { showUnits, showTeams, showInitiatives } = levelState;
  const getInitiativeCrossNames = useCallback(
    (initiativeId: string) => crossNamesForInitiative(initiativeId, bundle),
    [bundle]
  );

  const getCrossInitiativeTooltipMembers = useCallback(
    (crossId: string) => {
      const members = membersForCross(crossId, bundle?.members ?? []);
      return members
        .map((m) => {
          const row = initiativeById.get(m.initiative_id);
          return {
            initiativeName: row?.initiative ?? m.initiative_name ?? '—',
            team: m.team || row?.team || 'Без команды',
          };
        })
        .sort((a, b) =>
          a.initiativeName.localeCompare(b.initiativeName, 'ru', { sensitivity: 'base' })
        );
    },
    [bundle, initiativeById]
  );

  const crossNames = useMemo(
    () => (bundle?.crossInitiatives ?? []).map((c) => c.name),
    [bundle?.crossInitiatives]
  );

  const getTreemapColor = useMemo(
    () => createCrossOverviewColorGetter(crossNames),
    [crossNames]
  );
  const [selectedCrossId, setSelectedCrossId] = useState<string | null>(null);
  const [detailInitiativeId, setDetailInitiativeId] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string[]>([]);

  const handleCrossClick = useCallback((crossId: string) => {
    setSelectedCrossId(crossId);
    setDetailInitiativeId(null);
  }, []);

  const handleFocusedPathChange = useCallback(
    (path: string[]) => {
      setFocusedPath(path);
      onFocusedPathLengthChange(path.length);
      if (path.length === 0) {
        onLevelStateReset();
        setSelectedCrossId(null);
        setDetailInitiativeId(null);
      } else {
        const id = crossIdFromFocusedPath(path, bundle);
        if (id) setSelectedCrossId(id);
        if (path.length === 1) {
          onAutoEnableUnits();
        } else if (path.length === 2) {
          onAutoEnableTeams();
        } else if (path.length >= 3) {
          onAutoEnableInitiatives();
        }
      }
    },
    [
      bundle,
      onFocusedPathLengthChange,
      onLevelStateReset,
      onAutoEnableUnits,
      onAutoEnableTeams,
      onAutoEnableInitiatives,
    ]
  );

  const handleInitiativeClick = useCallback((initiativeId: string) => {
    setDetailInitiativeId(initiativeId);
  }, []);

  const closeInitiativeDetail = useCallback(() => {
    setDetailInitiativeId(null);
  }, []);

  const closeSidePanel = useCallback(() => {
    setDetailInitiativeId(null);
    setSelectedCrossId(null);
  }, []);

  const selectedCross = useMemo(
    () => bundle?.crossInitiatives.find((c) => c.id === selectedCrossId),
    [bundle, selectedCrossId]
  );

  const resetZoomTrigger = useMemo(
    () =>
      `${bundle?.crossInitiatives.length ?? 0}:${bundle?.members.length ?? 0}:${bundle?.crossInitiatives.map((c) => c.id).join(',') ?? ''}`,
    [bundle]
  );

  const scopeActive = crossScopeFilterActive(filterUnits, filterTeams);

  const visibleCrosses = useMemo(() => {
    const crosses = bundle?.crossInitiatives ?? [];
    const members = bundle?.members ?? [];
    if (!scopeActive) return crosses;
    return crosses.filter((cross) =>
      membersForCross(cross.id, members).some((m) =>
        crossMemberMatchesScope(m, initiativeById.get(m.initiative_id), filterUnits, filterTeams)
      )
    );
  }, [bundle, scopeActive, filterUnits, filterTeams, initiativeById]);

  const tree = useMemo(() => {
    const members = bundle?.members ?? [];
    const raw = buildCrossInitiativeOverviewTree(
      visibleCrosses,
      members,
      initiativeById,
      selectedQuarters,
      budgetCtx
    );
    const viewed = applyCrossOverviewView(raw, {
      showUnits,
      showTeams,
      showInitiatives,
    });
    const normalized = prepareStaticTreemapTree(viewed);
    return balanceCrossOverviewTreemapValues(normalized);
  }, [
    bundle?.members,
    visibleCrosses,
    initiativeById,
    selectedQuarters,
    budgetCtx,
    showUnits,
    showTeams,
    showInitiatives,
  ]);

  const maxRenderDepth = useMemo(
    () => crossOverviewRenderDepth(tree, focusedPath),
    [tree, focusedPath]
  );

  const isEmpty = !bundle?.crossInitiatives.length;
  const isFilteredEmpty = !isEmpty && visibleCrosses.length === 0;
  const showSidePanel = Boolean(selectedCrossId && selectedCross);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-4">
        <p className="text-muted-foreground max-w-md">
          Пока нет кросс-инициатив. Создайте первую связь между инициативами разных команд.
        </p>
        <Button type="button" onClick={onSwitchToLink}>
          Создать новую
        </Button>
      </div>
    );
  }

  if (isFilteredEmpty) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-8 text-center">
        <p className="text-muted-foreground max-w-md">
          Нет кросс-инициатив с участием выбранного юнита или команды. Смените фильтр.
        </p>
      </div>
    );
  }

  const viewKey = `${resetZoomTrigger}|u${showUnits}|t${showTeams}|i${showInitiatives}|${focusedPath.join('/')}`;

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-w-0 min-h-0 relative">
        <StaticTreemapContainer
          data={tree}
          hasData={!isEmpty}
          selectedQuarters={selectedQuarters}
          showMoney={showMoney}
          showDistributionInTooltip={showMoney}
          getColor={getTreemapColor}
          treemapLayoutStrategy="d3-root"
          maxRenderDepth={maxRenderDepth}
          showTeams={showTeams}
          showInitiatives={showInitiatives}
          disableAutoEnableLevels
          focusedPath={focusedPath}
          onCrossInitiativeClick={handleCrossClick}
          onAutoEnableUnits={onAutoEnableUnits}
          onAutoEnableTeams={onAutoEnableTeams}
          onAutoEnableInitiatives={onAutoEnableInitiatives}
          onAutoDisableUnits={onAutoDisableUnits}
          onAutoDisableTeams={onAutoDisableTeams}
          onAutoDisableInitiatives={onAutoDisableInitiatives}
          emptyStateTitle="Нет кросс-инициатив"
          emptyStateShowResetButton={false}
          onFocusedPathChange={handleFocusedPathChange}
          resetZoomTrigger={resetZoomTrigger}
          onAdminInitiativeRowClick={handleInitiativeClick}
          contentKey={viewKey}
          nodeCursor="pointer"
          getInitiativeCrossNames={getInitiativeCrossNames}
          getCrossInitiativeTooltipMembers={getCrossInitiativeTooltipMembers}
        />
      </div>

      {showSidePanel && selectedCross && (
        <aside className="w-full max-w-md border-l border-border shrink-0 flex flex-col min-h-0 bg-background">
          <div className="flex justify-end p-2 border-b border-border shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={detailInitiativeId ? 'К кросс-инициативе' : 'Закрыть панель'}
              onClick={detailInitiativeId ? closeInitiativeDetail : closeSidePanel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {detailInitiativeId ? (
            <InitiativeUnificationPanel
              initiativeId={detailInitiativeId}
              initiativeRow={initiativeById.get(detailInitiativeId)}
              bundle={bundle}
              initiativeById={initiativeById}
              selectedQuarters={selectedQuarters}
              budgetCtx={budgetCtx}
              showMoney={showMoney}
              highlightCrossId={selectedCrossId}
              onRemoveFromCross={onRemoveFromCross}
              onSaveShares={onSaveShares}
              removing={removing}
              savingShares={savingShares}
            />
          ) : (
            <CrossInitiativePanel
              cross={selectedCross}
              bundle={bundle!}
              allInitiatives={allInitiatives}
              initiativeById={initiativeById}
              selectedQuarters={selectedQuarters}
              budgetPeriodLabel={budgetPeriodLabel}
              budgetCtx={budgetCtx}
              showMoney={showMoney}
              onEditInitiativeShares={handleInitiativeClick}
              onAddMember={(initiativeId) => onAddToCross(selectedCross.id, initiativeId)}
              onRemoveFromCross={onRemoveFromCross}
              addingMember={addingToCross}
              onSaveName={(name) => onSaveCrossName(selectedCross.id, name)}
              onSaveDescription={(description) =>
                onSaveCrossDescription(selectedCross.id, description)
              }
              savingName={savingCrossName}
              savingDescription={savingCrossDescription}
              removing={removing}
            />
          )}
        </aside>
      )}
    </div>
  );
}
