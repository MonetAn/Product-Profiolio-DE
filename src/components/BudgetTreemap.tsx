// BudgetTreemap - Framer Motion powered treemap visualization

import { TreemapContainer } from './treemap';
import StaticTreemapContainer from './treemap/StaticTreemapContainer';
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
  onInitiativeClick?: (initiativeName: string, path: string) => void;
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
  viewKey?: string;
  showMoney?: boolean;
  /** When support/off-track/stub filter changes, use filter animation (same speed as filter toggles) */
  contentKey?: string;
  /** По умолчанию true (главная страница); для встроенных мини-превью — false */
  showUploadButton?: boolean;
  showPreliminaryWarnings?: boolean;
  /** Главная: при маске sensitive без exit-анимации — нет просвета старых листьев при перестроении */
  skipExitAnimation?: boolean;
  /** Супер-админ: отдельный StaticTreemapContainer (динамический TreemapContainer без изменений) */
  useStaticLayout?: boolean;
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
  viewKey,
  showMoney = true,
  contentKey,
  showUploadButton = true,
  showPreliminaryWarnings = false,
  skipExitAnimation = false,
  useStaticLayout = false,
}: BudgetTreemapProps) => {
  const treemapProps = {
    data,
    contentKey,
    showTeams,
    showInitiatives,
    showMoney,
    onNavigateBack,
    canNavigateBack,
    onInitiativeClick,
    selectedQuarters,
    hasData,
    onResetFilters,
    selectedUnitsCount,
    clickedNodeName,
    getColor: getUnitColor,
    emptyStateTitle: 'Нет инициатив по выбранным фильтрам',
    emptyStateSubtitle: 'Попробуйте изменить параметры фильтрации или сбросить фильтры',
    showUploadButton,
    onUploadClick: showUploadButton ? onUploadClick : undefined,
    onFileDrop,
    onAutoEnableTeams,
    onAutoEnableInitiatives,
    onAutoDisableTeams,
    onAutoDisableInitiatives,
    onFocusedPathChange,
    resetZoomTrigger,
    initialFocusedPath,
    viewKey,
    showPreliminaryWarnings,
  } as const;

  if (useStaticLayout) {
    return <StaticTreemapContainer {...treemapProps} />;
  }

  return <TreemapContainer {...treemapProps} skipExitAnimation={skipExitAnimation} />;
};

export default BudgetTreemap;
