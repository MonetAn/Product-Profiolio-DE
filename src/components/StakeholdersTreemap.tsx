// StakeholdersTreemap - Framer Motion powered treemap visualization

import { TreemapContainer } from './treemap';
import { TreeNode, shiftHue } from '@/lib/dataManager';

// Deep, saturated palette for stakeholders with high contrast for white text
const stakeholderColorPalette = [
  '#7B5FA8',  // Глубокий фиолетовый
  '#4A7DD7',  // Насыщенный синий
  '#2D9B6A',  // Тёмный изумруд
  '#C44E89',  // Глубокий розовый
  '#E67A3D',  // Тыквенный оранж
  '#4A90B8',  // Стальной синий
  '#D4852C',  // Янтарь
  '#8B6AAF',  // Аметист
];
const stakeholderColors: Record<string, string> = {};
let stakeholderColorIndex = 0;

// Generate extended color with hue shifting for uniqueness
function generateStakeholderColor(index: number): string {
  const baseIndex = index % stakeholderColorPalette.length;
  const generation = Math.floor(index / stakeholderColorPalette.length);

  if (generation === 0) {
    return stakeholderColorPalette[baseIndex];
  }

  // For subsequent generations, shift hue alternating +/- direction
  const hueShift = generation * 25 * (generation % 2 === 0 ? 1 : -1);
  return shiftHue(stakeholderColorPalette[baseIndex], hueShift);
}

function getStakeholderColor(name: string): string {
  if (!stakeholderColors[name]) {
    stakeholderColors[name] = generateStakeholderColor(stakeholderColorIndex++);
  }
  return stakeholderColors[name];
}

interface StakeholdersTreemapProps {
  data: TreeNode;
  onNodeClick?: (node: TreeNode) => void;
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
  selectedQuarters?: string[];
  hasData?: boolean;
  onInitiativeClick?: (initiativeName: string) => void;
  onResetFilters?: () => void;
  selectedUnitsCount?: number;
  clickedNodeName?: string | null;
  onAutoEnableTeams?: () => void;
  onAutoEnableInitiatives?: () => void;
  onAutoDisableTeams?: () => void;
  onAutoDisableInitiatives?: () => void;
  onFocusedPathChange?: (path: string[]) => void;
  resetZoomTrigger?: number;
  showTeams?: boolean;
  showInitiatives?: boolean;
  initialFocusedPath?: string[];
}

const StakeholdersTreemap = ({
  data,
  onNavigateBack,
  canNavigateBack = false,
  selectedQuarters = [],
  hasData = false,
  onInitiativeClick,
  onResetFilters,
  selectedUnitsCount = 0,
  clickedNodeName = null,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onFocusedPathChange,
  resetZoomTrigger,
  showTeams = false,
  showInitiatives = false,
  initialFocusedPath,
}: StakeholdersTreemapProps) => {
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
      getColor={getStakeholderColor}
      emptyStateTitle="Нет инициатив по выбранным фильтрам"
      emptyStateSubtitle="Попробуйте изменить параметры фильтрации или сбросить фильтры"
      showUploadButton={false}
      extraDepth={1}
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

export default StakeholdersTreemap;
