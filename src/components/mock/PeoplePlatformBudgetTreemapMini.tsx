import { useCallback, useMemo } from 'react';
import BudgetTreemap from '@/components/BudgetTreemap';
import { buildBudgetTree, type BuildTreeOptions } from '@/lib/dataManager';
import { PEOPLE_PLATFORM_BUDGET_MOCK_QUARTERS, PEOPLE_PLATFORM_BUDGET_MOCK_RAW } from '@/lib/peoplePlatformBudgetMockRaw';

const TREE_OPTIONS: BuildTreeOptions = {
  selectedQuarters: [...PEOPLE_PLATFORM_BUDGET_MOCK_QUARTERS],
  supportFilter: 'all',
  showOnlyOfftrack: false,
  hideStubs: false,
  selectedStakeholders: [],
  unitFilter: '',
  teamFilter: '',
  showTeams: true,
  showInitiatives: true,
};

/**
 * Тот же бюджетный treemap, что на главной (BudgetTreemap + buildBudgetTree), на демо-данных «по рынкам».
 * Уменьшен по высоте контейнера под макет People Platform.
 */
export function PeoplePlatformBudgetTreemapMini() {
  const data = useMemo(() => buildBudgetTree(PEOPLE_PLATFORM_BUDGET_MOCK_RAW, TREE_OPTIONS), []);

  const noop = useCallback(() => {}, []);
  const noopFile = useCallback((_file: File) => {}, []);
  const noopInitiative = useCallback((_name: string, _path: string) => {}, []);

  return (
    <div
      className="people-platform-mock-budget-treemap"
      style={{
        height: 400,
        minHeight: 280,
        width: '100%',
        position: 'relative',
      }}
    >
      <BudgetTreemap
        viewKey="pp-mock-budget-markets"
        contentKey="pp-mock-budget-markets-v1"
        data={data}
        showTeams
        showInitiatives
        selectedQuarters={[...PEOPLE_PLATFORM_BUDGET_MOCK_QUARTERS]}
        hasData={PEOPLE_PLATFORM_BUDGET_MOCK_RAW.length > 0}
        showUploadButton={false}
        onUploadClick={undefined}
        onFileDrop={noopFile}
        onNavigateBack={noop}
        canNavigateBack={false}
        onInitiativeClick={noopInitiative}
        onResetFilters={noop}
        selectedUnitsCount={0}
        clickedNodeName={null}
        onAutoEnableTeams={noop}
        onAutoEnableInitiatives={noop}
        onAutoDisableTeams={noop}
        onAutoDisableInitiatives={noop}
        showMoney
      />
    </div>
  );
}
