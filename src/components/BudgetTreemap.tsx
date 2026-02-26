// BudgetTreemap - Framer Motion powered treemap visualization

import { TreemapContainer } from './treemap';
import { TreeNode, getUnitColor } from '@/lib/dataManager';

interface BudgetTreemapProps {
  data: TreeNode;
  onDrillDown?: (node: TreeNode) => void;
  onNavigateUp?: () => void;
  showBackButton?: boolean;
  showTeams?: boolean;
  showInitiatives?: boolean;
  onUploadClick?: () => void;
  selectedQuarters?: string[];
  onNodeClick?: (node: TreeNode) => void;
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
  onInitiativeClick?: (initiativeName: string) => void;
  onFileDrop?: (file: File) => void;
  hasData?: boolean;
  onResetFilters?: () => void;
  selectedUnitsCount?: number;
  clickedNodeName?: string | null;
  onAutoEnableTeams?: () => void;
  onAutoEnableInitiatives?: () => void;
  onAutoDisableTeams?: () => void;
  onAutoDisableInitiatives?: () => void;
  onFocusedPathChange?: (path: string[]) => void;
  resetZoomTrigger?: number;
  initialFocusedPath?: string[];
}

const BudgetTreemap = ({
  data,
  showTeams = false,
  showInitiatives = false,
  onUploadClick,
  selectedQuarters = [],
  onNavigateBack,
  canNavigateBack = false,
  onInitiativeClick,
  onFileDrop,
  hasData = false,
  onResetFilters,
  selectedUnitsCount = 0,
  clickedNodeName = null,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onFocusedPathChange,
  resetZoomTrigger,
  initialFocusedPath,
}: BudgetTreemapProps) => {
  return (
    <TreemapContainer
      data={data}
      showTeams={showTeams}
      showInitiatives={showInitiatives}
      onNavigateBack={onNavigateBack}
      canNavigateBack={canNavigateBack}
      onInitiativeClick={onInitiativeClick}
      selectedQuarters={selectedQuarters}
      hasData={hasData}
      onResetFilters={onResetFilters}
      selectedUnitsCount={selectedUnitsCount}
      clickedNodeName={clickedNodeName}
      getColor={getUnitColor}
      emptyStateTitle="Нет инициатив по выбранным фильтрам"
      emptyStateSubtitle="Попробуйте изменить параметры фильтрации или сбросить фильтры"
      showUploadButton={true}
      onUploadClick={onUploadClick}
      onFileDrop={onFileDrop}
      onAutoEnableTeams={onAutoEnableTeams}
      onAutoEnableInitiatives={onAutoEnableInitiatives}
      onAutoDisableTeams={onAutoDisableTeams}
      onAutoDisableInitiatives={onAutoDisableInitiatives}
      onFocusedPathChange={onFocusedPathChange}
      resetZoomTrigger={resetZoomTrigger}
      initialFocusedPath={initialFocusedPath}
    />
  );
};

export default BudgetTreemap;
